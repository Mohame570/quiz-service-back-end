import {
  Injectable,
  GoneException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { InvitationStatus, QuizStatus } from '../../../generated/prisma/client';
import { TransactionClient } from '../../../generated/prisma/internal/prismaNamespace';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Logger } from '@nestjs/common';

type EligibleRecipient = { invitationId: string; recipientEmail: string };

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async expireStaleInvitations() {
    // you can simply treat an unaccepted invite as expired once the quiz's `endsAt` has passed.
    // find the quiz for each invitation
    // see if the quiz expires then invitation is expired.
    const now = new Date();
    const closedQuizIds = await this.prisma.quiz.findMany({
      where: {
        OR: [
          { endsAt: { not: null, lte: now } },
          { status: { in: [QuizStatus.CLOSED, QuizStatus.ARCHIVED] } },
        ],
      },
      select: { id: true },
    });

    if (closedQuizIds.length === 0) {
      this.logger.log('there is no closed quizes .. ');
      return 0;
    }

    const { count } = await this.prisma.invitation.updateMany({
      where: {
        quizId: { in: closedQuizIds.map((q) => q.id) },
        status: InvitationStatus.PENDING,
      },
      data: { status: InvitationStatus.EXPIRED },
    });

    this.logger.log(`Expired Invitations ${count}`);
    return count;
  }

  isInvitationExpired(
    invitationStatus: InvitationStatus,
    quizEndsAt: Date | null,
    quizStatus: QuizStatus | null,
    now = new Date(),
  ): boolean {
    if (invitationStatus === InvitationStatus.CLAIMED) return false;

    if (quizEndsAt && quizEndsAt <= now) return true;

    if (
      (quizStatus && quizStatus === QuizStatus.ARCHIVED) ||
      quizStatus === QuizStatus.CLOSED
    ) {
      return true;
    }
    return false;
  }

  async getEligibleRecipientsForQuiz(
    quizId: string,
  ): Promise<EligibleRecipient[]> {
    // get invtiations that has quiz Id == quiz Id, status is Pending, not expired
    // get invitaions for a specific quiz and where its status is pending , not expired is null.

    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('Quiz not found');

    if (
      (quiz.endsAt && quiz.endsAt <= new Date()) ||
      quiz.status === QuizStatus.CLOSED ||
      quiz.status === QuizStatus.ARCHIVED
    ) {
      return [] as EligibleRecipient[];
    }

    const invitations = await this.prisma.invitation.findMany({
      where: {
        quizId,
        status: InvitationStatus.PENDING,
      },
      select: { recipientEmail: true, id: true },
      orderBy: { createdAt: 'asc' },
    });

    return invitations.map((i) => {
      return {
        invitationId: i.id,
        recipientEmail: i.recipientEmail,
      };
    });
  }

  async claimPendingInvitationsForUser(tx: TransactionClient, userId: string) {
    const now = new Date();
    const user = await tx.user.findUnique({
      where: {
        id: userId,
      },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('404 Student account not found');
    }
    const invitations = await tx.invitation.findMany({
      where: {
        status: InvitationStatus.PENDING,
        recipientEmail: user?.email,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    for (const invitation of invitations) {
      await tx.invitation.update({
        where: {
          id: invitation.id,
        },
        data: {
          userId: user?.id,
          status: InvitationStatus.CLAIMED,
          claimedAt: now,
        },
      });

      await tx.studentProfile.update({
        where: {
          userId: user?.id,
        },
        data: {
          quizzes: {
            connect: {
              id: invitation.quizId,
            },
          },
        },
      });
    }
  }
  async claimInvitation(tx: TransactionClient, userId: string, quizId: string) {
    const user = await tx.user.findUnique({
      where: {
        id: userId,
      },
      select: { id: true, email: true },
    });
    const now = new Date();

    const studentProfile = await tx.studentProfile.findUnique({
      where: { userId: user?.id },
      select: {
        userId: true,
        quizzes: {
          where: { id: quizId },
          select: { id: true },
        },
      },
    });

    if (!studentProfile) {
      throw new NotFoundException('Student profile not found.');
    }
    const invitation = await tx.invitation.findFirst({
      where: {
        quizId,
        status: InvitationStatus.PENDING,
        recipientEmail: user?.email,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    if (!invitation) {
      const claimedInvitation = await tx.invitation.findFirst({
        where: {
          quizId,
          recipientEmail: user?.email,
          status: InvitationStatus.CLAIMED,
        },
        orderBy: {
          claimedAt: 'desc',
        },
      });

      if (claimedInvitation?.userId === user?.id) {
        return {
          assigned: false,
          alreadyAssigned: true,
        };
      }
      const expiredInvitation = await tx.invitation.findFirst({
        where: {
          quizId,
          recipientEmail: user?.email,
          status: InvitationStatus.PENDING,
          expiresAt: {
            lt: now,
          },
        },
      });

      if (expiredInvitation) {
        throw new GoneException('This quiz invitation has expired.');
      }

      throw new ForbiddenException(
        'You do not have an active invitation to this quiz.',
      );
    }
    // mark it as claimed

    await tx.invitation.update({
      where: {
        id: invitation.id,
      },
      data: {
        userId: user?.id,
        status: InvitationStatus.CLAIMED,
        claimedAt: now,
      },
    });

    const alreadyAssigned = studentProfile.quizzes.length > 0;

    if (!alreadyAssigned) {
      await tx.studentProfile.update({
        where: {
          userId: user?.id,
        },
        data: {
          quizzes: {
            connect: {
              id: quizId,
            },
          },
        },
      });
    }

    return {
      assigned: !alreadyAssigned,
      alreadyAssigned,
    };
  }
}
