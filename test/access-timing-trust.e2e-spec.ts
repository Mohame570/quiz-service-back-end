// test/access-timing-trust.e2e-spec.ts
//
// Comprehensive Integration & E2E Tests for Track:
// "Access, Timing & Trust: Invitation operations + password recovery + sign-in activity"
//
// Tests:
// 1. Admin invitation status tracking: dynamic status calculation (ACCEPTED, PENDING, EXPIRED).
// 2. Reminder functionality: strictly enforced server-side eligibility, preview matching dispatch.
// 3. Enumeration-safe password recovery: identical response for registered & unregistered emails.
// 4. Password reset token security: single-use enforcement, expiration rejection, invalid token rejection.
// 5. Session management & tokenVersion invalidation: rejecting JWTs with outdated tokenVersion upon password reset.

import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { createHash } from 'crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { NotificationService } from '../src/modules/notifications/services/notification.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { QuizService } from '../src/modules/quiz/services/quiz.service';
import { InvitationService } from '../src/modules/auth/services/invitation.service';
import { InvitationStatus, QuizStatus, UserRole } from '../src/generated/prisma/client';

describe('Access, Timing & Trust (E2E & Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationService: NotificationService;
  let quizService: QuizService;
  let invitationService: InvitationService;
  let jwtService: JwtService;
  let jwtAuthGuard: JwtAuthGuard;

  const mockStudent = {
    id: 'student-cuid-1',
    email: 'student@example.com',
    passwordHash: '$2b$12$LXhNGSmcMMwxNMV2rLCLtu50MMKYkSlkAaD2JWfnJe2CqbWlV9vbK',
    name: 'Eligible Student',
    role: UserRole.STUDENT,
    isActive: true,
    emailVerified: true,
    tokenVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    notificationService = app.get<NotificationService>(NotificationService);
    quizService = app.get<QuizService>(QuizService);
    invitationService = app.get<InvitationService>(InvitationService);
    jwtService = app.get<JwtService>(JwtService);
    jwtAuthGuard = app.get<JwtAuthGuard>(JwtAuthGuard);
  });

  beforeEach(() => {
    // Reset and mock notification dispatch methods before each test
    jest.spyOn(notificationService, 'sendPasswordResetEmail').mockResolvedValue({
      deliveryLogId: 'log-prt-1',
      status: 'SENT' as any,
      templateKey: 'PASSWORD_RESET' as any,
      subject: 'Reset your password',
      html: '<p>Reset</p>',
      text: 'Reset',
      errorMessage: null,
      providerMessageId: 'mock-prt-id',
      deliveredAt: new Date(),
      attemptCount: 1,
    });

    jest.spyOn(notificationService, 'sendQuizReminderEmail').mockResolvedValue({
      deliveryLogId: 'log-rem-1',
      status: 'SENT' as any,
      templateKey: 'QUIZ_REMINDER' as any,
      subject: 'Reminder: Assessment',
      html: '<p>Reminder</p>',
      text: 'Reminder',
      errorMessage: null,
      providerMessageId: 'mock-rem-id',
      deliveredAt: new Date(),
      attemptCount: 1,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // 1. Admin Invitation Status Tracking
  // =========================================================================
  describe('Invitation Status Tracking (QuizService.getInvitationsForQuiz)', () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    it('correctly tracks ACCEPTED, PENDING, and EXPIRED invitation statuses based on attempts and dates', async () => {
      const activeQuiz = {
        id: 'quiz-1',
        title: 'Active Assessment',
        status: QuizStatus.PUBLISHED,
        startsAt: pastDate,
        endsAt: futureDate,
      };

      const invitations = [
        // 1. Claimed invite -> ACCEPTED
        {
          id: 'inv-1',
          recipientEmail: 'accepted@example.com',
          status: InvitationStatus.CLAIMED,
          claimedAt: now,
          expiresAt: futureDate,
          createdAt: new Date('2026-09-01T00:00:00Z'),
          userId: 'user-1',
          user: { name: 'Alice', attempts: [] },
        },
        // 2. Unclaimed invite but user already has an attempt -> ACCEPTED
        {
          id: 'inv-2',
          recipientEmail: 'attempted@example.com',
          status: InvitationStatus.PENDING,
          claimedAt: null,
          expiresAt: futureDate,
          createdAt: new Date('2026-09-02T00:00:00Z'),
          userId: 'user-2',
          user: { name: 'Bob', attempts: [{ id: 'att-1' }] },
        },
        // 3. Pending invite with future expiration -> PENDING
        {
          id: 'inv-3',
          recipientEmail: 'pending@example.com',
          status: InvitationStatus.PENDING,
          claimedAt: null,
          expiresAt: futureDate,
          createdAt: new Date('2026-09-03T00:00:00Z'),
          userId: null,
          user: null,
        },
        // 4. Pending invite with past expiration -> EXPIRED
        {
          id: 'inv-4',
          recipientEmail: 'expired@example.com',
          status: InvitationStatus.PENDING,
          claimedAt: null,
          expiresAt: pastDate,
          createdAt: new Date('2026-09-04T00:00:00Z'),
          userId: null,
          user: null,
        },
      ];

      jest.spyOn(prisma.quiz, 'findUnique').mockResolvedValue(activeQuiz as any);
      jest.spyOn(prisma.invitation, 'findMany').mockResolvedValue(invitations as any);

      const result = await quizService.getInvitationsForQuiz('quiz-1');

      expect(result).toHaveLength(4);
      expect(result.find((i) => i.recipientEmail === 'accepted@example.com')?.status).toBe(InvitationStatus.CLAIMED);
      expect(result.find((i) => i.recipientEmail === 'pending@example.com')?.status).toBe(InvitationStatus.PENDING);
      expect(result.find((i) => i.recipientEmail === 'expired@example.com')?.status).toBe(InvitationStatus.EXPIRED);
    });

    it('marks all unclaimed invitations as EXPIRED when quiz schedule window has closed', async () => {
      const closedQuiz = {
        id: 'quiz-2',
        title: 'Closed Assessment',
        status: QuizStatus.PUBLISHED,
        startsAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),
        endsAt: pastDate, // Closed
      };

      const invitations = [
        {
          id: 'inv-5',
          recipientEmail: 'pending-in-closed@example.com',
          status: InvitationStatus.PENDING,
          claimedAt: null,
          expiresAt: futureDate, // Even if invite token expiration is future, quiz itself is ended!
          createdAt: new Date(),
          userId: null,
          user: null,
        },
      ];

      jest.spyOn(prisma.quiz, 'findUnique').mockResolvedValue(closedQuiz as any);
      jest.spyOn(prisma.invitation, 'findMany').mockResolvedValue(invitations as any);

      const result = await quizService.getInvitationsForQuiz('quiz-2');

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('EXPIRED');
    });
  });

  // =========================================================================
  // 2. Server-Side Reminder Eligibility & Preview Dispatch Matching
  // =========================================================================
  describe('Reminder Functionality & Server-Side Eligibility', () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    it('rejects reminders if quiz is in DRAFT status', async () => {
      const draftQuiz = {
        id: 'quiz-draft',
        title: 'Draft Quiz',
        status: QuizStatus.DRAFT,
        startsAt: pastDate,
        endsAt: futureDate,
      };

      jest.spyOn(prisma.quiz, 'findUnique').mockResolvedValue(draftQuiz as any);

      await expect(quizService.sendQuizReminders('quiz-draft')).rejects.toThrow(
        'Can only send reminders for published quizzes.',
      );
    });

    it('returns empty eligible recipients when quiz schedule window has closed', async () => {
      const endedQuiz = {
        id: 'quiz-ended',
        title: 'Ended Quiz',
        status: QuizStatus.PUBLISHED,
        startsAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),
        endsAt: pastDate,
      };

      jest.spyOn(prisma.quiz, 'findUnique').mockResolvedValue(endedQuiz as any);

      const preview = await quizService.getRemindPreview('quiz-ended');
      expect(preview.count).toBe(0);
      expect(preview.recipients).toEqual([]);
    });

    it('preview recipient count strictly matches actual dispatched reminder candidates', async () => {
      const activeQuiz = {
        id: 'quiz-active',
        title: 'Midterm Exam',
        status: QuizStatus.PUBLISHED,
        startsAt: pastDate,
        endsAt: futureDate,
      };

      const mockEligibleRecipients = [
        {
          invitationId: 'inv-active-1',
          recipientEmail: 'student1@example.com',
        },
      ];

      jest.spyOn(prisma.quiz, 'findUnique').mockResolvedValue(activeQuiz as any);
      jest
        .spyOn(invitationService, 'getEligibleRecipientsForQuiz')
        .mockResolvedValue(mockEligibleRecipients as any);

      // 1. Check Preview
      const preview = await quizService.getRemindPreview('quiz-active');
      expect(preview.count).toBe(1);
      expect(preview.recipients).toEqual(['student1@example.com']);

      // 2. Check Send
      const sendResult = await quizService.sendQuizReminders('quiz-active');
      expect(sendResult.sent).toBe(1);
      expect(sendResult.attempted).toBe(1);
      expect(sendResult.failed).toBe(0);
      expect(sendResult.results).toHaveLength(1);
      expect(notificationService.sendQuizReminderEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: 'student1@example.com',
          quizTitle: 'Midterm Exam',
          availableUntil: futureDate,
        }),
      );
    });
  });

  // =========================================================================
  // 3. Enumeration-Safe Password Recovery
  // =========================================================================
  describe('Enumeration-Safe Password Recovery (/api/auth/forgot-password)', () => {
    it('returns exact same status, body, and message for existing and non-existing accounts', async () => {
      (jest.spyOn(prisma.user, 'findUnique') as any).mockImplementation(
        async ({ where }: any) => {
          if (where.email === 'student@example.com') {
            return mockStudent as any;
          }
          return null;
        },
      );

      jest.spyOn(prisma.passwordResetToken, 'deleteMany').mockResolvedValue({ count: 0 });
      jest.spyOn(prisma.passwordResetToken, 'create').mockResolvedValue({ id: 'prt-1' } as any);
      jest.spyOn(prisma, '$transaction').mockImplementation((async (ops: any) => {
        if (Array.isArray(ops)) return Promise.all(ops);
        if (typeof ops === 'function') return ops(prisma);
        return ops;
      }) as any);

      // 1. Request with registered email
      const registeredRes = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'student@example.com' })
        .expect(200);

      // 2. Request with non-existent email
      const unregisteredRes = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'ghost@example.com' })
        .expect(200);

      // Verify strict enumeration safety parity
      expect(registeredRes.status).toBe(unregisteredRes.status);
      expect(registeredRes.body).toEqual(unregisteredRes.body);
      expect(registeredRes.body.message).toBe(
        'If an account exists for this email, a password reset link has been sent.',
      );

      // Verify that email was sent ONLY for registered user
      expect(notificationService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(notificationService.sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: 'student@example.com',
        }),
      );
    });
  });

  // =========================================================================
  // 4. Token Security & Single-Use Enforcement
  // =========================================================================
  describe('Password Reset Token Security (/api/auth/reset-password)', () => {
    const rawToken = 'plain-secure-reset-token-12345';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    it('rejects an invalid or non-existent token with 400 Bad Request', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({
          token: 'invalid-non-existent-token',
          newPassword: 'StrongNewPass123!',
        })
        .expect(400);

      expect(res.body.message).toContain('Invalid or expired password reset token');
    });

    it('rejects an expired token with 400 Bad Request', async () => {
      const expiredTokenRecord = {
        id: 'prt-expired',
        tokenHash,
        userId: mockStudent.id,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        usedAt: null,
        user: mockStudent,
      };

      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue(expiredTokenRecord as any);

      const res = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: 'StrongNewPass123!',
        })
        .expect(400);

      expect(res.body.message).toContain('Password reset token has expired');
    });

    it('rejects an already-used token with 400 Bad Request (single-use enforcement)', async () => {
      const usedTokenRecord = {
        id: 'prt-used',
        tokenHash,
        userId: mockStudent.id,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(Date.now() - 60000), // already used 1 minute ago
        user: mockStudent,
      };

      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue(usedTokenRecord as any);

      const res = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: 'StrongNewPass123!',
        })
        .expect(400);

      expect(res.body.message).toContain('This password reset token has already been used');
    });

    it('successfully resets password, marks token as used, and increments user tokenVersion', async () => {
      const validTokenRecord = {
        id: 'prt-valid',
        tokenHash,
        userId: mockStudent.id,
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        user: mockStudent,
      };

      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue(validTokenRecord as any);
      const userUpdateSpy = jest.spyOn(prisma.user, 'update').mockResolvedValue({
        ...mockStudent,
        tokenVersion: 1,
      } as any);
      const tokenUpdateSpy = jest.spyOn(prisma.passwordResetToken, 'update').mockResolvedValue({
        ...validTokenRecord,
        usedAt: new Date(),
      } as any);
      jest.spyOn(prisma, '$transaction').mockImplementation((async (ops: any) => {
        if (Array.isArray(ops)) return Promise.all(ops);
        if (typeof ops === 'function') return ops(prisma);
        return ops;
      }) as any);

      const res = await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: 'BrandNewSecurePassword123!',
        })
        .expect(200);

      expect(res.body.message).toContain('Password has been reset successfully');
      expect(userUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockStudent.id },
          data: expect.objectContaining({
            tokenVersion: { increment: 1 },
          }),
        }),
      );
      expect(tokenUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prt-valid' },
          data: expect.objectContaining({
            usedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // =========================================================================
  // 5. Session Management & Immediate Session Invalidation
  // =========================================================================
  describe('Session Management & Invalidation via tokenVersion (JwtAuthGuard)', () => {
    it('immediately rejects existing active session tokens after password reset due to tokenVersion mismatch', async () => {
      // Create a JWT signed with tokenVersion: 0 (prior to reset)
      const oldSessionToken = await jwtService.signAsync({
        sub: mockStudent.id,
        email: mockStudent.email,
        role: mockStudent.role,
        tokenVersion: 0,
      });

      // User in database has now incremented tokenVersion to 1 (following password reset)
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        ...mockStudent,
        tokenVersion: 1, // Incremented!
      } as any);

      // Create a mock ExecutionContext
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: `Bearer ${oldSessionToken}`,
            },
          }),
        }),
      } as ExecutionContext;

      // JwtAuthGuard should reject the outdated token
      await expect(jwtAuthGuard.canActivate(mockExecutionContext)).rejects.toThrow(
        new UnauthorizedException('Session has expired. Please sign in again.'),
      );
    });

    it('accepts tokens that match the current user tokenVersion', async () => {
      // Create a JWT signed with current tokenVersion: 1
      const validSessionToken = await jwtService.signAsync({
        sub: mockStudent.id,
        email: mockStudent.email,
        role: mockStudent.role,
        tokenVersion: 1,
      });

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        ...mockStudent,
        tokenVersion: 1,
      } as any);

      const mockRequest: any = {
        headers: {
          authorization: `Bearer ${validSessionToken}`,
        },
      };

      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as ExecutionContext;

      const canActivate = await jwtAuthGuard.canActivate(mockExecutionContext);
      expect(canActivate).toBe(true);
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user.sub).toBe(mockStudent.id);
    });
  });
});
