// test/notifications-admin.e2e-spec.ts
//
// Unit-style integration tests for the admin notification monitoring endpoints.
// Uses a mocked PrismaService so tests run fast without a live database.

import { Test, TestingModule } from '@nestjs/testing';
import { EmailDeliveryStatus } from '../src/generated/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { MailTransportService } from '../src/modules/notifications/services/mail-transport.service';
import { NotificationService } from '../src/modules/notifications/services/notification.service';
import { NotificationsAdminController } from '../src/modules/notifications/controllers/notifications-admin.controller';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

function makePrismaMock() {
  return {
    emailDeliveryLog: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    quiz: {
      findMany: jest.fn(),
    },
  };
}

function makeMailTransportMock() {
  return { sendMail: jest.fn() };
}

const mockJwtAuthGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

describe('NotificationsAdminController', () => {
  let controller: NotificationsAdminController;
  let service: NotificationService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let mailTransport: ReturnType<typeof makeMailTransportMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    mailTransport = makeMailTransportMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsAdminController],
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailTransportService, useValue: mailTransport },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get<NotificationsAdminController>(
      NotificationsAdminController,
    );
    service = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // getDeliverySummary
  // -----------------------------------------------------------------------

  describe('GET /api/admin/notifications/delivery-summary', () => {
    it('returns aggregated counts and per-quiz invitation breakdown', async () => {
      prisma.emailDeliveryLog.count
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(42) // sent
        .mockResolvedValueOnce(5) // failed
        .mockResolvedValueOnce(3); // pending

      prisma.emailDeliveryLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          status: EmailDeliveryStatus.SENT,
          correlationId: 'invitation:quiz-1',
          metadata: {},
        },
        {
          id: 'log-2',
          status: EmailDeliveryStatus.SENT,
          correlationId: 'invitation:quiz-1',
          metadata: {},
        },
        {
          id: 'log-3',
          status: EmailDeliveryStatus.FAILED,
          correlationId: 'invitation:quiz-2',
          metadata: {},
        },
      ]);

      prisma.quiz.findMany.mockResolvedValue([
        { id: 'quiz-1', title: 'Sprint 1 Assessment' },
        { id: 'quiz-2', title: 'Practice Quiz' },
      ]);

      const result = await controller.getDeliverySummary();

      expect(result.overall.total).toBe(50);
      expect(result.overall.sent).toBe(42);
      expect(result.overall.failed).toBe(5);
      expect(result.overall.pending).toBe(3);
      expect(result.invitations).toHaveLength(2);
      expect(result.invitations[0].quizId).toBe('quiz-1');
      expect(result.invitations[0].totalInvited).toBe(2);
      expect(result.invitations[0].totalSent).toBe(2);
      expect(result.invitations[1].quizId).toBe('quiz-2');
      expect(result.invitations[1].totalInvited).toBe(1);
      expect(result.invitations[1].totalFailed).toBe(1);
    });

    it('returns zero counts when no delivery logs exist', async () => {
      prisma.emailDeliveryLog.count.mockResolvedValue(0);
      prisma.emailDeliveryLog.findMany.mockResolvedValue([]);
      prisma.quiz.findMany.mockResolvedValue([]);

      const result = await controller.getDeliverySummary();

      expect(result.overall.total).toBe(0);
      expect(result.overall.sent).toBe(0);
      expect(result.invitations).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getInvitationStatus
  // -----------------------------------------------------------------------

  describe('GET /api/admin/notifications/invitation-status', () => {
    it('returns quiz-grouped invitation delivery stats', async () => {
      prisma.emailDeliveryLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          status: EmailDeliveryStatus.SENT,
          correlationId: 'invitation:quiz-1',
          metadata: {},
        },
        {
          id: 'log-2',
          status: EmailDeliveryStatus.FAILED,
          correlationId: 'invitation:quiz-1',
          metadata: {},
        },
        {
          id: 'log-3',
          status: EmailDeliveryStatus.PENDING,
          correlationId: 'invitation:quiz-2',
          metadata: {},
        },
      ]);

      prisma.quiz.findMany.mockResolvedValue([
        { id: 'quiz-1', title: 'Assessment' },
        { id: 'quiz-2', title: 'Practice' },
      ]);

      const result = await controller.getInvitationStatus();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        quizId: 'quiz-1',
        quizTitle: 'Assessment',
        totalInvited: 2,
        totalSent: 1,
        totalFailed: 1,
      });
      expect(result[1]).toMatchObject({
        quizId: 'quiz-2',
        quizTitle: 'Practice',
        totalInvited: 1,
        totalPending: 1,
      });
    });
  });
});
