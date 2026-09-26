import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AttemptsService } from '../../attempts/services/attempts.service';
import { AttemptStatus } from '../../../generated/prisma/client';

export type CertificatePublicView = {
  code: string;
  recipientName: string;
  quizTitle: string;
  score: number;
  maxScore: number;
  percentage: number;
  issuedAt: Date;
};

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: AttemptsService,
  ) {}

  /// Issue (or return existing) certificate for an official passing attempt.
  async issueForAttempt(
    studentId: string,
    attemptId: string,
  ): Promise<CertificatePublicView> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { quiz: true },
    });
    if (!attempt || attempt.studentId !== studentId) {
      throw new NotFoundException('Attempt not found.');
    }
    if (
      attempt.status !== AttemptStatus.SUBMITTED &&
      attempt.status !== AttemptStatus.TIMED_OUT
    ) {
      throw new ForbiddenException('Attempt is not finalized yet.');
    }

    const existing = await this.prisma.certificate.findUnique({
      where: { attemptId },
    });
    if (existing) return this.toPublicView(existing);

    // Official score must come from THIS attempt and must pass.
    // passingScore is a percentage threshold (same convention as scoring).
    const official = await this.attempts.getOfficialScore(
      attempt.quizId,
      studentId,
    );
    const threshold = attempt.quiz.passingScore ?? 50;
    const officialAttempt = official.attemptId
      ? await this.prisma.attempt.findUnique({
          where: { id: official.attemptId },
        })
      : null;
    const maxScore = officialAttempt?.maxScore ?? 0;
    const percentage =
      official.officialScore != null && maxScore > 0
        ? Math.round((official.officialScore / maxScore) * 100 * 100) / 100
        : 0;
    if (
      official.attemptId !== attemptId ||
      official.officialScore == null ||
      percentage < threshold
    ) {
      throw new ForbiddenException(
        'Certificate is only issued for official passing attempts.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { name: true, email: true },
    });

    const created = await this.prisma.certificate.create({
      data: {
        code: await this.generateUniqueCode(),
        attemptId,
        studentId,
        quizId: attempt.quizId,
        recipientName: user?.name ?? user?.email ?? 'Student',
        quizTitle: attempt.quiz.title,
        score: official.officialScore,
        maxScore,
        percentage,
      },
    });
    return this.toPublicView(created);
  }

  /// Student fetches their own certificate for an attempt (404 if none).
  async getMyCertificate(
    studentId: string,
    attemptId: string,
  ): Promise<CertificatePublicView> {
    const cert = await this.prisma.certificate.findUnique({
      where: { attemptId },
    });
    if (!cert || cert.studentId !== studentId) {
      throw new NotFoundException('Certificate not found.');
    }
    return this.toPublicView(cert);
  }

  /// Public logged-out verification by share code. Exposes display fields only.
  async verifyByCode(code: string): Promise<CertificatePublicView> {
    const cert = await this.prisma.certificate.findUnique({ where: { code } });
    if (!cert) throw new NotFoundException('Certificate not found.');
    return this.toPublicView(cert);
  }

  private toPublicView(cert: {
    code: string;
    recipientName: string;
    quizTitle: string;
    score: number;
    maxScore: number;
    percentage: number;
    issuedAt: Date;
  }): CertificatePublicView {
    return {
      code: cert.code,
      recipientName: cert.recipientName,
      quizTitle: cert.quizTitle,
      score: cert.score,
      maxScore: cert.maxScore,
      percentage: cert.percentage,
      issuedAt: cert.issuedAt,
    };
  }

  private async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code =
        'CERT-' +
        randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
      const clash = await this.prisma.certificate.findUnique({
        where: { code },
      });
      if (!clash) return code;
    }
    throw new ForbiddenException('Could not generate a certificate code.');
  }
}