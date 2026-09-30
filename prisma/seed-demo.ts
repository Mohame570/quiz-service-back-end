import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AttemptStatus,
  Difficulty,
  GradingStatus,
  PrismaClient,
  QuestionType,
  QuizStatus,
  ScoreStrategy,
  UserRole,
} from '../src/generated/prisma/client';


// ---------------------------------------------------------------------------
// Sprint 4 — deterministic institutional demo seed.
// Rules: fixed IDs, fixed timestamps, fixed password hash, no randomness.
// Safe to run any number of times: it wipes its own scope first.
// ---------------------------------------------------------------------------

const DEMO_PASSWORD_HASH = '$2b$10$80FEADTLelpotwmz3XgYlA.yJILvssvp9O4bHImCv7CAB/fV6OIZIDooe';
const ADMIN_ID = 'demo-admin-01';
const PASSER_ID = 'demo-passer-01';
const FAILER_ID = 'demo-failer-01';
const QUIZ_ID = 'demo-quiz-1';

const Q_MCQ_1 = 'demo-q-mcq-1'; // Algebra MCQ
const Q_MCQ_2 = 'demo-q-mcq-2'; // Geometry MCQ
const Q_MS_1 = 'demo-q-ms-1'; // Algebra MULTI_SELECT
const Q_CC_1 = 'demo-q-cc-1'; // Python CODE_CONTEXT
const Q_FB_1 = 'demo-q-fb-1'; // Python FILL_BLANK
const DEMO_Q_IDS = [Q_MCQ_1, Q_MCQ_2, Q_MS_1, Q_CC_1, Q_FB_1];

const ATT_PASS_1 = 'demo-att-pass-1'; // passer 10/10
const ATT_FAIL_1 = 'demo-att-fail-1'; // failer 2/10
const ATT_FAIL_2 = 'demo-att-fail-2'; // failer retry 8/10 (BEST story)
const DEMO_ATT_IDS = [ATT_PASS_1, ATT_FAIL_1, ATT_FAIL_2];

const CODE_SNIPPET = 'for i in range(3):\n    print(i)';

async function main() {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/quiz_service?schema=public',
  });
  const prisma = new PrismaClient({ adapter });
  console.log('🌱 Seeding deterministic demo bank...');

  // ---- Users (upsert by email = idempotent) ----
  await prisma.user.upsert({
    where: { email: 'demo-admin@example.com' },
    update: {},
    create: {
      id: ADMIN_ID, email: 'demo-admin@example.com', passwordHash: DEMO_PASSWORD_HASH,
      name: 'Demo Admin', role: UserRole.ADMIN, emailVerified: true,
    },
  });
  await prisma.user.upsert({
    where: { email: 'demo-passer@example.com' },
    update: {},
    create: {
      id: PASSER_ID, email: 'demo-passer@example.com', passwordHash: DEMO_PASSWORD_HASH,
      name: 'Demo Passer', role: UserRole.STUDENT, emailVerified: true,
    },
  });
  await prisma.user.upsert({
    where: { email: 'demo-failer@example.com' },
    update: {},
    create: {
      id: FAILER_ID, email: 'demo-failer@example.com', passwordHash: DEMO_PASSWORD_HASH,
      name: 'Demo Failer', role: UserRole.STUDENT, emailVerified: true,
    },
  });
  for (const userId of [PASSER_ID, FAILER_ID]) {
    await prisma.studentProfile.upsert({
      where: { userId }, update: {}, create: { userId },
    });
  }

  // ---- Quiz ----
  await prisma.quiz.upsert({
    where: { id: QUIZ_ID },
    update: {
      title: 'PitIQ Demo Assessment', passingScore: 60,
      maxAttempts: 3, scoreStrategy: ScoreStrategy.BEST,
      students: { set: [{ userId: PASSER_ID }, { userId: FAILER_ID }] },
    },
    create: {
      id: QUIZ_ID, title: 'PitIQ Demo Assessment',
      description: 'Deterministic demo: MCQ, multi-select, code-context',
      status: QuizStatus.PUBLISHED, durationMinutes: 30, passingScore: 60,
      maxAttempts: 3, scoreStrategy: ScoreStrategy.BEST,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T23:59:59Z'),
      createdById: ADMIN_ID,
      students: { connect: [{ userId: PASSER_ID }, { userId: FAILER_ID }] },
    },
  });

  // ---- Wipe demo scope (attempts cascade answers/results/certificates) ----
  await prisma.attempt.deleteMany({ where: { id: { in: DEMO_ATT_IDS } } });
  await prisma.quizQuestion.deleteMany({ where: { quizId: QUIZ_ID } });
  await prisma.question.deleteMany({ where: { id: { in: DEMO_Q_IDS } } });
  await prisma.cheatingEventLog.deleteMany({ where: { attemptId: { in: DEMO_ATT_IDS } } });

  // ---- Questions (fixed IDs, topics + tags) ----
  await prisma.question.createMany({
    data: [
      { id: Q_MCQ_1, type: QuestionType.MCQ, text: 'If 2x + 3 = 11, what is x?',
        options: ['4', '5', '3', '6'], correctAnswer: '4', points: 2,
        difficulty: Difficulty.EASY, topic: 'Algebra', tags: ['algebra', 'equations'] },
      { id: Q_MCQ_2, type: QuestionType.MCQ, text: 'What is the sum of interior angles of a triangle?',
        options: ['180', '360', '90', '270'], correctAnswer: '180', points: 2,
        difficulty: Difficulty.EASY, topic: 'Geometry', tags: ['geometry', 'angles'] },
      { id: Q_MS_1, type: QuestionType.MULTI_SELECT, text: 'Which of these numbers are prime?',
        options: ['2', '3', '4', '5'], correctAnswer: '', correctAnswers: ['2', '3', '5'], points: 3,
        difficulty: Difficulty.MEDIUM, topic: 'Algebra', tags: ['algebra', 'primes'] },
      { id: Q_CC_1, type: QuestionType.CODE_CONTEXT, text: 'What does this code print?',
        options: [], correctAnswer: '0 1 2', points: 2,
        codeSnippet: CODE_SNIPPET, codeLanguage: 'python',
        difficulty: Difficulty.MEDIUM, topic: 'Python', tags: ['python', 'loops'] },
      { id: Q_FB_1, type: QuestionType.FILL_BLANK, text: 'Which keyword defines a function in Python? ____',
        options: [], correctAnswer: 'def', points: 1,
        difficulty: Difficulty.EASY, topic: 'Python', tags: ['python', 'syntax'] },
    ],
  });
  await prisma.quizQuestion.createMany({
    data: DEMO_Q_IDS.map((questionId, order) => ({ quizId: QUIZ_ID, questionId, order })),
  });

  // maxScore = 2+2+3+2+1 = 10
  const snap = {
    [Q_MCQ_1]: { t: 'If 2x + 3 = 11, what is x?', o: ['4', '5', '3', '6'], ca: '4', cas: [] as string[], pts: 2, type: QuestionType.MCQ },
    [Q_MCQ_2]: { t: 'What is the sum of interior angles of a triangle?', o: ['180', '360', '90', '270'], ca: '180', cas: [] as string[], pts: 2, type: QuestionType.MCQ },
    [Q_MS_1]: { t: 'Which of these numbers are prime?', o: ['2', '3', '4', '5'], ca: '', cas: ['2', '3', '5'], pts: 3, type: QuestionType.MULTI_SELECT },
    [Q_CC_1]: { t: 'What does this code print?', o: [] as string[], ca: '0 1 2', cas: [] as string[], pts: 2, type: QuestionType.CODE_CONTEXT },
    [Q_FB_1]: { t: 'Which keyword defines a function in Python? ____', o: [] as string[], ca: 'def', cas: [] as string[], pts: 1, type: QuestionType.FILL_BLANK },
  };
  const frozen = (qid: string) => ({
    snapshotText: snap[qid].t, snapshotOptions: snap[qid].o,
    snapshotCorrectAnswer: snap[qid].ca, snapshotCorrectAnswers: snap[qid].cas,
    snapshotType: snap[qid].type, snapshotPoints: snap[qid].pts,
    ...(qid === Q_CC_1
      ? { snapshotCodeSnippet: CODE_SNIPPET, snapshotCodeLanguage: 'python' }
      : {}),
  });

  // ---- Attempt 1: passer 10/10 (all correct) ----
  await prisma.attempt.create({
    data: {
      id: ATT_PASS_1, quizId: QUIZ_ID, studentId: PASSER_ID,
      status: AttemptStatus.SUBMITTED,
      startedAt: new Date('2026-09-10T09:00:00Z'),
      expiresAt: new Date('2026-09-10T09:30:00Z'),
      submittedAt: new Date('2026-09-10T09:25:00Z'),
      score: 10, maxScore: 10,
      answers: {
        create: [
          { questionId: Q_MCQ_1, selectedOptionId: '4', isCorrect: true, pointsEarned: 2, answeredAt: new Date('2026-09-10T09:05:00Z'), ...frozen(Q_MCQ_1) },
          { questionId: Q_MCQ_2, selectedOptionId: '180', isCorrect: true, pointsEarned: 2, answeredAt: new Date('2026-09-10T09:08:00Z'), ...frozen(Q_MCQ_2) },
          { questionId: Q_MS_1, selectedOptionIds: ['2', '3', '5'], isCorrect: true, pointsEarned: 3, answeredAt: new Date('2026-09-10T09:12:00Z'), ...frozen(Q_MS_1) },
          { questionId: Q_CC_1, textAnswer: '0 1 2', isCorrect: true, pointsEarned: 2, answeredAt: new Date('2026-09-10T09:18:00Z'), ...frozen(Q_CC_1) },
          { questionId: Q_FB_1, textAnswer: 'def', isCorrect: true, pointsEarned: 1, answeredAt: new Date('2026-09-10T09:20:00Z'), ...frozen(Q_FB_1) },
        ],
      },
      result: {
        create: { studentId: PASSER_ID, quizId: QUIZ_ID, score: 10, maxScore: 10,
          percentage: 100, passed: true, gradingStatus: GradingStatus.COMPLETE, pendingEssayCount: 0 },
      },
    },
  });
  await prisma.certificate.create({
    data: {
      id: 'demo-cert-01', code: 'CERT-DEMO01', attemptId: ATT_PASS_1,
      studentId: PASSER_ID, quizId: QUIZ_ID, recipientName: 'Demo Passer',
      quizTitle: 'PitIQ Demo Assessment', score: 10, maxScore: 10, percentage: 100,
      issuedAt: new Date('2026-09-10T10:00:00Z'),
    },
  });

  // ---- Attempt 2: failer 2/10 (only Geometry right — weak in Algebra) ----
  await prisma.attempt.create({
    data: {
      id: ATT_FAIL_1, quizId: QUIZ_ID, studentId: FAILER_ID,
      status: AttemptStatus.SUBMITTED,
      startedAt: new Date('2026-09-11T09:00:00Z'),
      expiresAt: new Date('2026-09-11T09:30:00Z'),
      submittedAt: new Date('2026-09-11T09:22:00Z'),
      score: 2, maxScore: 10,
      answers: {
        create: [
          { questionId: Q_MCQ_1, selectedOptionId: '5', isCorrect: false, pointsEarned: 0, answeredAt: new Date('2026-09-11T09:05:00Z'), ...frozen(Q_MCQ_1) },
          { questionId: Q_MCQ_2, selectedOptionId: '180', isCorrect: true, pointsEarned: 2, answeredAt: new Date('2026-09-11T09:08:00Z'), ...frozen(Q_MCQ_2) },
          { questionId: Q_MS_1, selectedOptionIds: ['2', '4'], isCorrect: false, pointsEarned: 0, answeredAt: new Date('2026-09-11T09:12:00Z'), ...frozen(Q_MS_1) },
          { questionId: Q_CC_1, textAnswer: '1 2 3', isCorrect: false, pointsEarned: 0, answeredAt: new Date('2026-09-11T09:16:00Z'), ...frozen(Q_CC_1) },
          { questionId: Q_FB_1, textAnswer: 'function', isCorrect: false, pointsEarned: 0, answeredAt: new Date('2026-09-11T09:18:00Z'), ...frozen(Q_FB_1) },
        ],
      },
      result: {
        create: { studentId: FAILER_ID, quizId: QUIZ_ID, score: 2, maxScore: 10,
          percentage: 20, passed: false, gradingStatus: GradingStatus.COMPLETE, pendingEssayCount: 0 },
      },
    },
  });

  // ---- Attempt 3: failer RETRY 8/10 (BEST story: 2 → 8, now passes) ----
  await prisma.attempt.create({
    data: {
      id: ATT_FAIL_2, quizId: QUIZ_ID, studentId: FAILER_ID,
      status: AttemptStatus.SUBMITTED,
      startedAt: new Date('2026-09-12T09:00:00Z'),
      expiresAt: new Date('2026-09-12T09:30:00Z'),
      submittedAt: new Date('2026-09-12T09:24:00Z'),
      score: 8, maxScore: 10,
      answers: {
        create: [
          { questionId: Q_MCQ_1, selectedOptionId: '4', isCorrect: true, pointsEarned: 2, answeredAt: new Date('2026-09-12T09:05:00Z'), ...frozen(Q_MCQ_1) },
          { questionId: Q_MCQ_2, selectedOptionId: '180', isCorrect: true, pointsEarned: 2, answeredAt: new Date('2026-09-12T09:08:00Z'), ...frozen(Q_MCQ_2) },
          { questionId: Q_MS_1, selectedOptionIds: ['2', '3', '5'], isCorrect: true, pointsEarned: 3, answeredAt: new Date('2026-09-12T09:12:00Z'), ...frozen(Q_MS_1) },
          { questionId: Q_CC_1, textAnswer: '0 1 2', isCorrect: true, pointsEarned: 2, answeredAt: new Date('2026-09-12T09:18:00Z'), ...frozen(Q_CC_1) },
          { questionId: Q_FB_1, textAnswer: 'func', isCorrect: false, pointsEarned: 0, answeredAt: new Date('2026-09-12T09:20:00Z'), ...frozen(Q_FB_1) },
        ],
      },
      result: {
        create: { studentId: FAILER_ID, quizId: QUIZ_ID, score: 8, maxScore: 10,
          percentage: 80, passed: true, gradingStatus: GradingStatus.COMPLETE, pendingEssayCount: 0 },
      },
    },
  });
  await prisma.certificate.create({
    data: {
      id: 'demo-cert-02', code: 'CERT-DEMO02', attemptId: ATT_FAIL_2,
      studentId: FAILER_ID, quizId: QUIZ_ID, recipientName: 'Demo Failer',
      quizTitle: 'PitIQ Demo Assessment', score: 8, maxScore: 10, percentage: 80,
      issuedAt: new Date('2026-09-12T10:00:00Z'),
    },
  });

  // ---- Integrity flag: 3 events on the failing attempt ----
  await prisma.cheatingEventLog.createMany({
    data: [
      { id: 'demo-cheat-01', attemptId: ATT_FAIL_1, eventType: 'TAB_HIDDEN', description: 'Demo: tab switch during quiz', occurredAt: new Date('2026-09-11T09:10:00Z') },
      { id: 'demo-cheat-02', attemptId: ATT_FAIL_1, eventType: 'WINDOW_BLUR', description: 'Demo: window lost focus', occurredAt: new Date('2026-09-11T09:11:00Z') },
      { id: 'demo-cheat-03', attemptId: ATT_FAIL_1, eventType: 'COPY_PASTE', description: 'Demo: paste attempt', occurredAt: new Date('2026-09-11T09:15:00Z') },
    ],
  });

  console.log('✅ Demo seed complete (deterministic).');
  await prisma.$disconnect();
}

main().catch((e) => { console.error('Demo seed failed:', e); process.exit(1); });