import {
  Injectable,
  GoneException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { InvitationStatus} from '../../../generated/prisma/client';
import { TransactionClient } from '../../../generated/prisma/internal/prismaNamespace';

@Injectable()
export class InvitationService {

  constructor(
  ) {}

  async claimPendingInvitationsForUser(tx: TransactionClient, userId: string) {
    const now = new Date();
    const user = await tx.user.findUnique({
        where: {
            id: userId,
        },
        select: { id: true, email: true },
    });
    if (!user) {
        throw new NotFoundException("404 Student account not found")
    }
    const invitations = await tx.invitation.findMany({
        where: {
            status: InvitationStatus.PENDING,
            recipientEmail: user?.email,
            OR: [
                { expiresAt: null },
                { expiresAt: { gt: now } },
            ],
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
  async claimInvitation(tx: TransactionClient, userId: string, quizId: string){
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
        
      console.log('Claiming invitation:', invitation.id);
      console.log('Quiz ID:', invitation.quizId);
      console.log('Recipient email:', invitation.recipientEmail);
      console.log('Previous status:', invitation.status);
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