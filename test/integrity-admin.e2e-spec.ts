// test/integrity-admin.e2e-spec.ts
//
// Unit-style integration tests for the admin integrity monitoring endpoints.
// Uses a mocked PrismaService so tests run fast and deterministically
// without a live database.

import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { IntegrityService } from '../src/modules/integrity/services/integrity.service';
import { IntegrityAdminController } from '../src/modules/integrity/controllers/integrity-admin.controller';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';

const ATTEMPT_A = 'attempt-a';
const ATTEMPT_B = 'attempt-b';
const QUIZ_ID = 'quiz-1';

function makePrismaMock() {
  return {
    cheatingEventLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    attempt: {
      findMany: jest.fn(),
    },
    organizationSettings: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

/** Mock guard that always allows and attaches the request.user as-is. */
const mockJwtAuthGuard = {
  canActivate: jest.fn().mockImplementation((ctx) => {
    // Copy the user from the request; tests set it via mockReq below.
    const req = ctx.switchToHttp().getRequest();
    return true;
  }),
};

describe('IntegrityAdminController', () => {
  let controller: IntegrityAdminController;
  let service: IntegrityService;
  let prisma: ReturnType<typeof makePrismaMock>;

  const adminReq = { user: { sub: 'admin-1', email: 'admin@test.com', role: 'ADMIN' } };
  const studentReq = { user: { sub: 'student-1', email: 'student@test.com', role: 'STUDENT' } };

  beforeEach(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrityAdminController],
      providers: [
        IntegrityService,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get<IntegrityAdminController>(IntegrityAdminController);
    service = module.get<IntegrityService>(IntegrityService);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // getSuspiciousAttempts
  // -----------------------------------------------------------------------

  describe('GET /api/admin/integrity/suspicious', () => {
    it('rejects non-admin users', async () => {
      await expect(
        controller.getSuspiciousAttempts(studentReq, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns empty array when no attempts exceed the threshold', async () => {
      prisma.cheatingEventLog.groupBy.mockResolvedValue([]);

      const result = await controller.getSuspiciousAttempts(adminReq, { threshold: 3 });

      expect(result).toEqual([]);
      expect(prisma.cheatingEventLog.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          having: { id: { _count: { gte: 3 } } },
        }),
      );
    });

    it('uses default threshold of 3 when not provided', async () => {
      prisma.cheatingEventLog.groupBy.mockResolvedValue([]);

      await controller.getSuspiciousAttempts(adminReq, {});

      expect(prisma.cheatingEventLog.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          having: { id: { _count: { gte: 3 } } },
        }),
      );
    });

    it('returns flagged attempts with event details', async () => {
      prisma.cheatingEventLog.groupBy.mockResolvedValue([
        { attemptId: ATTEMPT_A, _count: { id: 5 }, _max: { occurredAt: new Date('2026-06-20T12:00:00Z') } },
        { attemptId: ATTEMPT_B, _count: { id: 3 }, _max: { occurredAt: new Date('2026-06-20T11:00:00Z') } },
      ]);

      prisma.attempt.findMany.mockResolvedValue([
        { id: ATTEMPT_A, studentId: 's1', quizId: QUIZ_ID, quiz: { title: 'Quiz 1' }, student: { user: { name: 'Student One' } } },
        { id: ATTEMPT_B, studentId: 's2', quizId: QUIZ_ID, quiz: { title: 'Quiz 1' }, student: { user: { name: 'Student Two' } } },
      ]);

      prisma.cheatingEventLog.findMany.mockResolvedValue([
        { id: 'e1', attemptId: ATTEMPT_A, eventType: 'TAB_HIDDEN', description: null, occurredAt: new Date('2026-06-20T12:00:00Z') },
        { id: 'e2', attemptId: ATTEMPT_A, eventType: 'WINDOW_BLUR', description: null, occurredAt: new Date('2026-06-20T11:55:00Z') },
        { id: 'e3', attemptId: ATTEMPT_B, eventType: 'COPY_PASTE', description: null, occurredAt: new Date('2026-06-20T11:00:00Z') },
      ]);

      const result = await controller.getSuspiciousAttempts(adminReq, { threshold: 3 });

      expect(result).toHaveLength(2);
      expect(result[0].attemptId).toBe(ATTEMPT_A);
      expect(result[0].eventCount).toBe(5);
      expect(result[0].studentName).toBe('Student One');
      expect(result[0].events).toHaveLength(2);
      expect(result[1].attemptId).toBe(ATTEMPT_B);
      expect(result[1].eventCount).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // getAttemptEvents
  // -----------------------------------------------------------------------

  describe('GET /api/admin/integrity/attempts/:attemptId/events', () => {
    it('rejects non-admin users', async () => {
      await expect(
        controller.getAttemptEvents(studentReq, ATTEMPT_A),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns events for a specific attempt ordered by time', async () => {
      prisma.cheatingEventLog.findMany.mockResolvedValue([
        { id: 'e1', attemptId: ATTEMPT_A, eventType: 'TAB_HIDDEN', description: 'Tab hidden', occurredAt: new Date('2026-06-20T12:00:00Z') },
        { id: 'e2', attemptId: ATTEMPT_A, eventType: 'WINDOW_BLUR', description: null, occurredAt: new Date('2026-06-20T11:55:00Z') },
      ]);

      const result = await controller.getAttemptEvents(adminReq, ATTEMPT_A);

      expect(result).toHaveLength(2);
      expect(result[0].eventType).toBe('TAB_HIDDEN');
      expect(result[1].eventType).toBe('WINDOW_BLUR');
      expect(prisma.cheatingEventLog.findMany).toHaveBeenCalledWith({
        where: { attemptId: ATTEMPT_A },
        orderBy: { occurredAt: 'desc' },
      });
    });

    it('returns empty array for attempt with no events', async () => {
      prisma.cheatingEventLog.findMany.mockResolvedValue([]);

      const result = await controller.getAttemptEvents(adminReq, ATTEMPT_A);

      expect(result).toEqual([]);
    });
  });
});
