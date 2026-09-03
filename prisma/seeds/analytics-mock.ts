import 'dotenv/config';

import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';

import {
  AttemptStatus,
  GradingStatus,
  PrismaClient,
  QuestionType,
  QuizStatus,
  UserRole,
} from '../../src/generated/prisma/client';

// ---------------------------------------------------------------------------
// Analytics mock data
//
// Seeds a small, self-contained dataset that demonstrates all five analytics
// metric states defined in docs/analytics-contract.md:
//   1. Participation  (any attempt exists)
//   2. Completion      (SUBMITTED + Result, gradingStatus COMPLETE)
//   3. Score            (Result.score / percentage, only when completed)
//   4. Absence          (assigned, window closed, zero attempts)
//   5. Follow-up        (SUBMITTED + Result, gradingStatus PARTIAL, essay pending)
//
// Also includes a NOT_STARTED student (open window, zero attempts — must
// NOT be conflated with ABSENT) and a zero-assignment quiz (out of scope,
// not an empty-state failure).
//
// This script is self-contained: it uses its own fixed IDs and does not
// depend on prisma/seed.ts. Safe to re-run — cleans up its own records
// before recreating them.
// ---------------------------------------------------------------------------

const QUIZ_CLOSED_ID = 'analytics-mock-quiz-closed';
const QUIZ_OPEN_ID = 'analytics-mock-quiz-open';
const QUIZ_UNASSIGNED_ID = 'analytics-mock-quiz-unassigned';

const STUDENT_EMAILS = {
  completed: 'analytics-mock.completed@example.com',
  followUp: 'analytics-mock.followup@example.com',
  notCompleted: 'analytics-mock.notcompleted@example.com',
  absent: 'analytics-mock.absent@example.com',
  notStarted: 'analytics-mock.notstarted@example.com',
} as const;

const ADMIN_EMAIL = 'analytics-mock.admin@example.com';

async function cleanup(prisma: PrismaClient): Promise<void> {
  // Delete in dependency order: attempt answers -> results -> attempts ->
  // quiz-question links -> questions -> quizzes. Users/profiles are upserted,
  // not deleted, so re-running never duplicates accounts.
  const quizIds = [QUIZ_CLOSED_ID, QUIZ_OPEN_ID, QUIZ_UNASSIGNED_ID];

  const attempts = await prisma.attempt.findMany({
    where: { quizId: { in: quizIds } },
    select: { id: true },
  });
  const attemptIds = attempts.map((a) => a.id);

  if (attemptIds.length > 0) {
    await prisma.attemptAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await prisma.result.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await prisma.attempt.deleteMany({ where: { id: { in: attemptIds } } });
  }

  await prisma.quizQuestion.deleteMany({ where: { quizId: { in: quizIds } } });
  await prisma.question.deleteMany({
    where: { quizQuestions: { none: {} }, text: { startsWith: '[analytics-mock]' } },
  });
  await prisma.quiz.deleteMany({ where: { id: { in: quizIds } } });
}

async function seedAnalyticsMock(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  await cleanup(prisma);

  // ---- Admin ----
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash, name: 'Analytics Mock Admin', role: UserRole.ADMIN, emailVerified: true },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      name: 'Analytics Mock Admin',
      role: UserRole.ADMIN,
      emailVerified: true,
    },
  });

  // ---- Students (one per metric state) ----
  const students: Record<keyof typeof STUDENT_EMAILS, { id: string }> = {} as never;

  for (const [key, email] of Object.entries(STUDENT_EMAILS)) {
    const nameMap: Record<string, string> = {
      completed: 'Completed Student',
      followUp: 'Pending Review Student',
      notCompleted: 'Timed Out Student',
      absent: 'Absent Student',
      notStarted: 'Not Started Student',
    };
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, name: nameMap[key], role: UserRole.STUDENT, emailVerified: true },
      create: {
        email,
        passwordHash,
        name: nameMap[key],
        role: UserRole.STUDENT,
        emailVerified: true,
      },
    });
    await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    students[key as keyof typeof STUDENT_EMAILS] = { id: user.id };
  }

  // ---- Quiz 1: CLOSED window — hosts completed / follow-up / not-completed / absent ----
  const closedQuiz = await prisma.quiz.create({
    data: {
      id: QUIZ_CLOSED_ID,
      title: 'Analytics Mock Quiz (Closed Window)',
      description: 'Seed fixture for docs/analytics-contract.md — closed window scenarios',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 20,
      passingScore: 60,
      startsAt: new Date('2026-08-01T09:00:00.000Z'),
      endsAt: new Date('2026-08-01T18:00:00.000Z'), // in the past relative to seed run
      createdById: admin.id,
      students: {
        connect: [
          { userId: students.completed.id },
          { userId: students.followUp.id },
          { userId: students.notCompleted.id },
          { userId: students.absent.id },
          // students.notStarted deliberately NOT assigned here — used on the open quiz instead
        ],
      },
    },
  });

  const mcq = await prisma.question.create({
    data: {
      type: QuestionType.MCQ,
      text: '[analytics-mock] Which status means a student engaged but never finished?',
      options: ['COMPLETED', 'PARTICIPATED_NOT_COMPLETED', 'ABSENT', 'NOT_STARTED'],
      correctAnswer: 'PARTICIPATED_NOT_COMPLETED',
      points: 5,
    },
  });
  const essay = await prisma.question.create({
    data: {
      type: QuestionType.ESSAY,
      text: '[analytics-mock] Explain the difference between absence and not-started.',
      options: [],
      correctAnswer: '',
      points: 5,
    },
  });

  await prisma.quizQuestion.createMany({
    data: [
      { quizId: closedQuiz.id, questionId: mcq.id, order: 0 },
      { quizId: closedQuiz.id, questionId: essay.id, order: 1 },
    ],
  });

  // -- Completed student: SUBMITTED, fully graded --
  const completedAttempt = await prisma.attempt.create({
    data: {
      quizId: closedQuiz.id,
      studentId: students.completed.id,
      startedAt: new Date('2026-08-01T10:00:00.000Z'),
      expiresAt: new Date('2026-08-01T10:20:00.000Z'),
      submittedAt: new Date('2026-08-01T10:18:00.000Z'),
      status: AttemptStatus.SUBMITTED,
      score: 8,
      maxScore: 10,
    },
  });
  await prisma.attemptAnswer.createMany({
    data: [
      {
        attemptId: completedAttempt.id,
        questionId: mcq.id,
        selectedOptionId: 'PARTICIPATED_NOT_COMPLETED',
        isCorrect: true,
        pointsEarned: 5,
      },
      {
        attemptId: completedAttempt.id,
        questionId: essay.id,
        textAnswer: 'Absence requires the window to close; not-started can still submit.',
        isCorrect: true,
        pointsEarned: 3,
        gradedById: admin.id,
        gradedAt: new Date('2026-08-01T12:00:00.000Z'),
      },
    ],
  });
  await prisma.result.create({
    data: {
      attemptId: completedAttempt.id,
      studentId: students.completed.id,
      quizId: closedQuiz.id,
      score: 8,
      maxScore: 10,
      percentage: 80,
      passed: true,
      gradingStatus: GradingStatus.COMPLETE,
      pendingEssayCount: 0,
    },
  });

  // -- Follow-up student: SUBMITTED, essay still pending manual grade --
  const followUpAttempt = await prisma.attempt.create({
    data: {
      quizId: closedQuiz.id,
      studentId: students.followUp.id,
      startedAt: new Date('2026-08-01T10:05:00.000Z'),
      expiresAt: new Date('2026-08-01T10:25:00.000Z'),
      submittedAt: new Date('2026-08-01T10:24:00.000Z'),
      status: AttemptStatus.SUBMITTED,
      score: 5,
      maxScore: 10,
    },
  });
  await prisma.attemptAnswer.createMany({
    data: [
      {
        attemptId: followUpAttempt.id,
        questionId: mcq.id,
        selectedOptionId: 'PARTICIPATED_NOT_COMPLETED',
        isCorrect: true,
        pointsEarned: 5,
      },
      {
        attemptId: followUpAttempt.id,
        questionId: essay.id,
        textAnswer: 'Awaiting admin review.',
        isCorrect: null,
        pointsEarned: null, // ungraded — drives pendingEssayCount
      },
    ],
  });
  await prisma.result.create({
    data: {
      attemptId: followUpAttempt.id,
      studentId: students.followUp.id,
      quizId: closedQuiz.id,
      score: 5,
      maxScore: 10,
      percentage: 50,
      passed: null, // undetermined until grading completes
      gradingStatus: GradingStatus.PARTIAL,
      pendingEssayCount: 1,
    },
  });

  // -- Not-completed student: TIMED_OUT, no Result --
  await prisma.attempt.create({
    data: {
      quizId: closedQuiz.id,
      studentId: students.notCompleted.id,
      startedAt: new Date('2026-08-01T10:10:00.000Z'),
      expiresAt: new Date('2026-08-01T10:30:00.000Z'),
      submittedAt: null,
      status: AttemptStatus.TIMED_OUT,
      score: null,
      maxScore: null,
    },
  });

  // -- Absent student: assigned, window closed, zero Attempt rows (no record created) --

  // ---- Quiz 2: OPEN window — hosts the not-started contrast case ----
  const openQuiz = await prisma.quiz.create({
    data: {
      id: QUIZ_OPEN_ID,
      title: 'Analytics Mock Quiz (Open Window)',
      description: 'Seed fixture for docs/analytics-contract.md — NOT_STARTED vs ABSENT contrast',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 20,
      passingScore: 60,
      startsAt: new Date('2026-08-01T09:00:00.000Z'),
      endsAt: null, // no closing window — ABSENT can never be reached here
      createdById: admin.id,
      students: {
        connect: [{ userId: students.notStarted.id }],
      },
    },
  });
  await prisma.quizQuestion.create({
    data: { quizId: openQuiz.id, questionId: mcq.id, order: 0 },
  });
  // students.notStarted deliberately has zero Attempt rows and the window is
  // open — this must resolve to NOT_STARTED, never ABSENT.

  // ---- Quiz 3: zero-assignment edge case (out of scope, not an empty-state failure) ----
  await prisma.quiz.create({
    data: {
      id: QUIZ_UNASSIGNED_ID,
      title: 'Analytics Mock Quiz (Unassigned)',
      description: 'Seed fixture for docs/analytics-contract.md — zero-assignment edge case',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 20,
      createdById: admin.id,
      // no students connected
    },
  });

  console.log('  ✓ Analytics mock data seeded');
  console.log('');
  console.log('  Test accounts (password: Password123!):');
  console.log(`    ${ADMIN_EMAIL} (ADMIN)`);
  console.log(`    ${STUDENT_EMAILS.completed} → COMPLETED (8/10, 80%)`);
  console.log(`    ${STUDENT_EMAILS.followUp} → COMPLETED_PENDING_REVIEW (5/10 provisional, 1 essay pending)`);
  console.log(`    ${STUDENT_EMAILS.notCompleted} → PARTICIPATED_NOT_COMPLETED (TIMED_OUT)`);
  console.log(`    ${STUDENT_EMAILS.absent} → ABSENT (assigned, window closed, zero attempts)`);
  console.log(`    ${STUDENT_EMAILS.notStarted} → NOT_STARTED (assigned, window open, zero attempts)`);
  console.log('');
  console.log('  Quizzes:');
  console.log(`    ${QUIZ_CLOSED_ID}      — closed window, 4 assigned students`);
  console.log(`    ${QUIZ_OPEN_ID}        — open window, 1 assigned student (NOT_STARTED contrast)`);
  console.log(`    ${QUIZ_UNASSIGNED_ID}  — zero assigned students (out-of-scope edge case)`);
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/quiz_service?schema=public',
  });

  const prisma = new PrismaClient({ adapter });

  console.log('🌱 Seeding analytics mock data...');
  console.log('');

  await seedAnalyticsMock(prisma);

  console.log('');
  console.log('✅ Analytics mock seed complete.');

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error('Analytics mock seed failed:', error);
  process.exit(1);
});