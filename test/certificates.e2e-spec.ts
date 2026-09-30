// test/certificates.e2e-spec.ts
//
// Sprint 4: certificate issuance strictly for official passing attempts,
// public logged-out verification, and access denial for failing attempts.
// Mocked PrismaService — no real database connection.

import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttemptStatus,
  ScoreStrategy,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AttemptsService } from '../src/modules/attempts/services/attempts.service';
import { CertificatesService } from '../src/modules/certificates/services/certificates.service';

const STUDENT_ID = 'student_cuid_1';
const OTHER_STUDENT = 'student_cuid_2';
const QUIZ_ID = 'quiz_cuid_1';
const ATTEMPT_ID = 'attempt_cuid_1';

function makeAttempt(overrides: Partial<any> = {}) {
  return {
    id: ATTEMPT_ID,
    quizId: QUIZ_ID,
    studentId: STUDENT_ID,
    status: AttemptStatus.SUBMITTED,
    score: 8,
    maxScore: 10,
    quiz: { id: QUIZ_ID, title: 'Algebra Basics', passingScore: 50 },
    ...overrides,
  };
}

function makeCert(overrides: Partial<any> = {}) {
  return {
    id: 'cert_1',
    code: 'CERT-ABC123',
    attemptId: ATTEMPT_ID,
    studentId: STUDENT_ID,
    quizId: QUIZ_ID,
    recipientName: 'Ali',
    quizTitle: 'Algebra Basics',
    score: 8,
    maxScore: 10,
    percentage: 80,
    issuedAt: new Date('2026-09-20T10:00:00Z'),
    ...overrides,
  };
}

function makePrisma() {
  return {
    attempt: { findUnique: jest.fn() },
    certificate: { findUnique: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
  };
}

describe('CertificatesService', () => {
  let service: CertificatesService;
  let prisma: ReturnType<typeof makePrisma>;
  let attempts: { getOfficialScore: jest.Mock };

  beforeEach(async () => {
    prisma = makePrisma();
    attempts = { getOfficialScore: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AttemptsService, useValue: attempts },
      ],
    }).compile();
    service = module.get<CertificatesService>(CertificatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('issues a certificate for an official passing attempt', async () => {
    prisma.attempt.findUnique
      .mockResolvedValueOnce(makeAttempt())
      .mockResolvedValueOnce(makeAttempt());
    prisma.certificate.findUnique.mockResolvedValue(null); // no existing, no clash
    attempts.getOfficialScore.mockResolvedValue({
      quizId: QUIZ_ID,
      strategy: ScoreStrategy.BEST,
      officialScore: 8,
      attemptId: ATTEMPT_ID,
      attemptsCount: 1,
    });
    prisma.user.findUnique.mockResolvedValue({ name: 'Ali', email: 'a@x.com' });
    prisma.certificate.create.mockImplementation(async ({ data }: any) => ({
      id: 'cert_1',
      issuedAt: new Date(),
      ...data,
    }));

    const result = await service.issueForAttempt(STUDENT_ID, ATTEMPT_ID);

    expect(result.recipientName).toBe('Ali');
    expect(result.quizTitle).toBe('Algebra Basics');
    expect(result.score).toBe(8);
    expect(result.code).toMatch(/^CERT-/);
    // Public view must not leak ownership internals.
    expect(result).not.toHaveProperty('studentId');
    expect(result).not.toHaveProperty('attemptId');
    expect(prisma.certificate.create).toHaveBeenCalledTimes(1);
  });

  it('returns the existing certificate instead of creating a duplicate', async () => {
    prisma.attempt.findUnique.mockResolvedValue(makeAttempt());
    prisma.certificate.findUnique.mockResolvedValue(makeCert());

    const result = await service.issueForAttempt(STUDENT_ID, ATTEMPT_ID);

    expect(result.code).toBe('CERT-ABC123');
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('blocks a failing attempt with 403 on every path', async () => {
    prisma.attempt.findUnique.mockResolvedValue(makeAttempt());
    prisma.certificate.findUnique.mockResolvedValue(null);
    attempts.getOfficialScore.mockResolvedValue({
      quizId: QUIZ_ID,
      strategy: ScoreStrategy.BEST,
      officialScore: 3,
      attemptId: ATTEMPT_ID,
      attemptsCount: 1,
    });

    await expect(
      service.issueForAttempt(STUDENT_ID, ATTEMPT_ID),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('blocks a passed-but-not-official attempt (LATEST points elsewhere)', async () => {
    prisma.attempt.findUnique.mockResolvedValue(makeAttempt());
    prisma.certificate.findUnique.mockResolvedValue(null);
    attempts.getOfficialScore.mockResolvedValue({
      quizId: QUIZ_ID,
      strategy: ScoreStrategy.LATEST,
      officialScore: 9,
      attemptId: 'newer_attempt',
      attemptsCount: 2,
    });

    await expect(
      service.issueForAttempt(STUDENT_ID, ATTEMPT_ID),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('blocks unfinalized attempts', async () => {
    prisma.attempt.findUnique.mockResolvedValue(
      makeAttempt({ status: AttemptStatus.IN_PROGRESS }),
    );

    await expect(
      service.issueForAttempt(STUDENT_ID, ATTEMPT_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  it('hides another student\u2019s certificate (404, not 403)', async () => {
    prisma.certificate.findUnique.mockResolvedValue(makeCert());

    await expect(
      service.getMyCertificate(OTHER_STUDENT, ATTEMPT_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('verifies a certificate publicly by code without authentication data', async () => {
    prisma.certificate.findUnique.mockResolvedValue(makeCert());

    const result = await service.verifyByCode('CERT-ABC123');

    expect(result).toEqual({
      code: 'CERT-ABC123',
      recipientName: 'Ali',
      quizTitle: 'Algebra Basics',
      score: 8,
      maxScore: 10,
      percentage: 80,
      issuedAt: makeCert().issuedAt,
    });
  });

  it('returns 404 for an unknown share code', async () => {
    prisma.certificate.findUnique.mockResolvedValue(null);

    await expect(service.verifyByCode('CERT-NOPE00')).rejects.toThrow(
      NotFoundException,
    );
  });
});
