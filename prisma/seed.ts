import 'dotenv/config';

import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';

import {
  AttemptStatus,
  EmailDeliveryStatus,
  NotificationTemplateKey,
  PrismaClient,
  QuestionType,
  QuizStatus,
  UserRole,
} from '../src/generated/prisma/client';

// ---------------------------------------------------------------------------
// Live-test fixtures (DO NOT MODIFY — used by CI/CD and live smoke tests)
// ---------------------------------------------------------------------------

const LIVE_TEST_CORRELATION_ID = 'live-test:failed-verification';

async function seedLiveTestFixtures(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@live-test.example' },
    update: { id: 'cmqmalcro0000zgud0fnpw5go', passwordHash, name: 'Live Test Admin', role: UserRole.ADMIN, emailVerified: true },
    create: {
      id: 'cmqmalcro0000zgud0fnpw5go', // fixed id referenced by quiz.live-spec.ts
      email: 'admin@live-test.example',
      passwordHash,
      name: 'Live Test Admin',
      role: UserRole.ADMIN,
      emailVerified: true,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'student@live-test.example' },
    update: { passwordHash, name: 'Live Test Student', role: UserRole.STUDENT },
    create: {
      email: 'student@live-test.example',
      passwordHash,
      name: 'Live Test Student',
      role: UserRole.STUDENT,
      emailVerified: true,
    },
  });

  await prisma.studentProfile.upsert({
    where: { userId: student.id },
    update: {},
    create: { userId: student.id },
  });

  await prisma.quiz.upsert({
    where: { id: 'seed-live-test-quiz' },
    update: {
      title: 'Live Test Quiz',
      description: 'Seeded quiz for live server smoke tests',
      status: QuizStatus.PUBLISHED,
      createdById: admin.id,
      students: { connect: [{ userId: student.id }] },
    },
    create: {
      id: 'seed-live-test-quiz',
      title: 'Live Test Quiz',
      description: 'Seeded quiz for live server smoke tests',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 30,
      passingScore: 70,
      createdById: admin.id,
      students: { connect: [{ userId: student.id }] },
    },
  });

  await prisma.emailDeliveryLog.deleteMany({
    where: { correlationId: LIVE_TEST_CORRELATION_ID },
  });

  await prisma.emailDeliveryLog.create({
    data: {
      recipientEmail: 'student@live-test.example',
      subject: 'Verify your email address',
      templateKey: NotificationTemplateKey.VERIFICATION,
      status: EmailDeliveryStatus.FAILED,
      correlationId: LIVE_TEST_CORRELATION_ID,
      attemptCount: 1,
      errorMessage: 'Seeded failed delivery for live resend smoke test',
      metadata: {
        rendered: {
          html: '<p>Live test verification email</p>',
          text: 'Live test verification email',
        },
        seed: true,
      },
    },
  });

  console.log('  ✓ Live-test fixtures seeded');
}

// ---------------------------------------------------------------------------
// Feature test data (for manual testing and Postman)
// ---------------------------------------------------------------------------

async function seedFeatureTestData(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // ---- Users ----
  const admin1 = await prisma.user.upsert({
    where: { email: 'admin1@example.com' },
    update: {},
    create: {
      email: 'admin1@example.com',
      passwordHash,
      name: 'Admin One',
      role: UserRole.ADMIN,
      emailVerified: true,
    },
  });

  const student1 = await prisma.user.upsert({
    where: { email: 'student1@example.com' },
    update: {},
    create: {
      email: 'student1@example.com',
      passwordHash,
      name: 'Student One',
      role: UserRole.STUDENT,
      emailVerified: true,
    },
  });

  const student2 = await prisma.user.upsert({
    where: { email: 'student2@example.com' },
    update: {},
    create: {
      email: 'student2@example.com',
      passwordHash,
      name: 'Student Two',
      role: UserRole.STUDENT,
      emailVerified: true,
    },
  });

  // Inactive user for live auth tests
await prisma.user.upsert({
  where: { email: 'inactive@live-test.example' },
  update: { passwordHash, isActive: false },
  create: {
    email: 'inactive@live-test.example',
    passwordHash,
    name: 'Live Test Inactive',
    role: UserRole.STUDENT,
    emailVerified: true,
    isActive: false,
  },
});

  // Ensure student profiles exist
  await prisma.studentProfile.upsert({
    where: { userId: student1.id },
    update: {},
    create: { userId: student1.id },
  });

  await prisma.studentProfile.upsert({
    where: { userId: student2.id },
    update: {},
    create: { userId: student2.id },
  });

  // Remove previously generated feature data so rerunning the seed does not
  // duplicate questions, attempts, answers, or notification logs.
  const featureQuizIds = ['quiz-1', 'quiz-2', 'quiz-3', 'quiz-4'];
  await prisma.attempt.deleteMany({
    where: { quizId: { in: featureQuizIds } },
  });
  await prisma.question.deleteMany({
    where: { quizId: { in: featureQuizIds } },
  });
  await prisma.emailDeliveryLog.deleteMany({
    where: {
      recipientEmail: { in: [student1.email, student2.email] },
    },
  });

  // ---- Quizzes ----
  const quiz1 = await prisma.quiz.upsert({
    where: { id: 'quiz-1' },
    update: {
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
    create: {
      id: 'quiz-1',
      title: 'Sprint 1 Assessment',
      description: 'Assessment quiz for Sprint 1',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 30,
      passingScore: 70,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T23:59:59Z'),
      createdById: admin1.id,
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
  });

  const quiz2 = await prisma.quiz.upsert({
    where: { id: 'quiz-2' },
    update: {
      students: { connect: [{ userId: student1.id }] },
    },
    create: {
      id: 'quiz-2',
      title: 'Practice Quiz',
      description: 'Practice questions for learning',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 15,
      createdById: admin1.id,
      students: { connect: [{ userId: student1.id }] },
    },
  });

  const quiz3 = await prisma.quiz.upsert({
    where: { id: 'quiz-3' },
    update: {},
    create: {
      id: 'quiz-3',
      title: 'Draft Quiz',
      description: 'This quiz is still in draft',
      status: QuizStatus.DRAFT,
      createdById: admin1.id,
    },
  });

  const quiz4 = await prisma.quiz.upsert({
    where: { id: 'quiz-4' },
    update: {
      students: { connect: [{ userId: student2.id }] },
    },
    create: {
      id: 'quiz-4',
      title: 'Closed Quiz',
      description: 'This quiz window has closed',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 20,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-01-31T23:59:59Z'),
      createdById: admin1.id,
      students: { connect: [{ userId: student2.id }] },
    },
  });

  // ---- Questions ----
  // Quiz 1: 5 questions (3 MCQ + 2 TRUE_FALSE)
  const q1_1 = await prisma.question.create({
    data: {
      quizId: quiz1.id,
      type: QuestionType.MCQ,
      text: 'What is the capital of France?',
      options: ['London', 'Paris', 'Berlin', 'Madrid'],
      correctAnswer: 'Paris',
    },
  });

  const q1_2 = await prisma.question.create({
    data: {
      quizId: quiz1.id,
      type: QuestionType.MCQ,
      text: 'Which planet is known as the Red Planet?',
      options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
      correctAnswer: 'Mars',
    },
  });

  const q1_3 = await prisma.question.create({
    data: {
      quizId: quiz1.id,
      type: QuestionType.MCQ,
      text: 'What is 2 + 2?',
      options: ['3', '4', '5', '6'],
      correctAnswer: '4',
    },
  });

  const q1_4 = await prisma.question.create({
    data: {
      quizId: quiz1.id,
      type: QuestionType.TRUE_FALSE,
      text: 'The Earth is flat.',
      options: ['True', 'False'],
      correctAnswer: 'False',
    },
  });

  const q1_5 = await prisma.question.create({
    data: {
      quizId: quiz1.id,
      type: QuestionType.TRUE_FALSE,
      text: 'Water boils at 100°C at sea level.',
      options: ['True', 'False'],
      correctAnswer: 'True',
    },
  });

  // Quiz 2: 3 questions (2 MCQ + 1 TRUE_FALSE)
  const q2_1 = await prisma.question.create({
    data: {
      quizId: quiz2.id,
      type: QuestionType.MCQ,
      text: 'What color is the sky on a clear day?',
      options: ['Blue', 'Green', 'Red', 'Yellow'],
      correctAnswer: 'Blue',
    },
  });

  const q2_2 = await prisma.question.create({
    data: {
      quizId: quiz2.id,
      type: QuestionType.MCQ,
      text: 'How many legs does a dog have?',
      options: ['2', '4', '6', '8'],
      correctAnswer: '4',
    },
  });

  const q2_3 = await prisma.question.create({
    data: {
      quizId: quiz2.id,
      type: QuestionType.TRUE_FALSE,
      text: 'JavaScript is a programming language.',
      options: ['True', 'False'],
      correctAnswer: 'True',
    },
  });

  // Quiz 4: 2 questions (1 MCQ + 1 TRUE_FALSE)
  const q4_1 = await prisma.question.create({
    data: {
      quizId: quiz4.id,
      type: QuestionType.MCQ,
      text: 'What is the largest planet in our solar system?',
      options: ['Earth', 'Mars', 'Jupiter', 'Saturn'],
      correctAnswer: 'Jupiter',
    },
  });

  const q4_2 = await prisma.question.create({
    data: {
      quizId: quiz4.id,
      type: QuestionType.TRUE_FALSE,
      text: 'The Sun is a star.',
      options: ['True', 'False'],
      correctAnswer: 'True',
    },
  });

  // ---- Attempts ----
  // Attempt 1: student1 → Quiz 1 (IN_PROGRESS, started 1h ago)
  const attempt1 = await prisma.attempt.create({
    data: {
      quizId: quiz1.id,
      studentId: student1.id,
      status: AttemptStatus.IN_PROGRESS,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  });

  // Attempt 2: student1 → Quiz 2 (SUBMITTED, score: 80/100, 3 answers)
  const attempt2 = await prisma.attempt.create({
    data: {
      quizId: quiz2.id,
      studentId: student1.id,
      status: AttemptStatus.SUBMITTED,
      startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      submittedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + 10 * 60 * 1000),
      score: 80,
      maxScore: 100,
    },
  });

  await prisma.attemptAnswer.createMany({
    data: [
      { attemptId: attempt2.id, questionId: q2_1.id, selectedOptionId: 'Blue', isCorrect: true },
      { attemptId: attempt2.id, questionId: q2_2.id, selectedOptionId: '4', isCorrect: true },
      { attemptId: attempt2.id, questionId: q2_3.id, selectedOptionId: 'True', isCorrect: true },
    ],
  });

  // Attempt 3: student2 → Quiz 1 (SUBMITTED, score: 100/100, 5 answers)
  const attempt3 = await prisma.attempt.create({
    data: {
      quizId: quiz1.id,
      studentId: student2.id,
      status: AttemptStatus.SUBMITTED,
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000),
      score: 100,
      maxScore: 100,
    },
  });

  await prisma.attemptAnswer.createMany({
    data: [
      { attemptId: attempt3.id, questionId: q1_1.id, selectedOptionId: 'Paris', isCorrect: true },
      { attemptId: attempt3.id, questionId: q1_2.id, selectedOptionId: 'Mars', isCorrect: true },
      { attemptId: attempt3.id, questionId: q1_3.id, selectedOptionId: '4', isCorrect: true },
      { attemptId: attempt3.id, questionId: q1_4.id, selectedOptionId: 'False', isCorrect: true },
      { attemptId: attempt3.id, questionId: q1_5.id, selectedOptionId: 'True', isCorrect: true },
    ],
  });

  // Attempt 4: student2 → Quiz 4 (TIMED_OUT, no answers)
  await prisma.attempt.create({
    data: {
      quizId: quiz4.id,
      studentId: student2.id,
      status: AttemptStatus.TIMED_OUT,
      startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  });

  // Attempt 5: student2 → Quiz 1 (SUBMITTED, score: 60/100, 5 answers, 3 correct)
  const attempt5 = await prisma.attempt.create({
    data: {
      quizId: quiz1.id,
      studentId: student2.id,
      status: AttemptStatus.SUBMITTED,
      startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000),
      score: 60,
      maxScore: 100,
    },
  });

  await prisma.attemptAnswer.createMany({
    data: [
      { attemptId: attempt5.id, questionId: q1_1.id, selectedOptionId: 'Paris', isCorrect: true },
      { attemptId: attempt5.id, questionId: q1_2.id, selectedOptionId: 'Venus', isCorrect: false },
      { attemptId: attempt5.id, questionId: q1_3.id, selectedOptionId: '4', isCorrect: true },
      { attemptId: attempt5.id, questionId: q1_4.id, selectedOptionId: 'True', isCorrect: false },
      { attemptId: attempt5.id, questionId: q1_5.id, selectedOptionId: 'True', isCorrect: true },
    ],
  });

  // ---- Email Delivery Logs (3 new) ----
  await prisma.emailDeliveryLog.create({
    data: {
      recipientEmail: 'student1@example.com',
      subject: 'Verify your email address',
      templateKey: NotificationTemplateKey.VERIFICATION,
      status: EmailDeliveryStatus.SENT,
      attemptCount: 1,
    },
  });

  await prisma.emailDeliveryLog.create({
    data: {
      recipientEmail: 'student2@example.com',
      subject: 'Quiz invitation: Sprint 1 Assessment',
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
      status: EmailDeliveryStatus.SENT,
      attemptCount: 1,
    },
  });

  await prisma.emailDeliveryLog.create({
    data: {
      recipientEmail: 'student1@example.com',
      subject: 'Quiz invitation: Practice Quiz',
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
      status: EmailDeliveryStatus.PENDING,
      attemptCount: 0,
    },
  });

  console.log('  ✓ Feature test data seeded');
  console.log('');

  // ---- Verify assignments in join table ----
  const assignments = await prisma.quiz.findMany({
    where: { id: { in: ['quiz-1', 'quiz-2', 'quiz-3', 'quiz-4'] } },
    select: {
      id: true,
      students: { select: { user: { select: { email: true } } } },
    },
  });

  const byStudent = new Map<string, string[]>();
  for (const quiz of assignments) {
    for (const sp of quiz.students) {
      const list = byStudent.get(sp.user.email) ?? [];
      list.push(quiz.id);
      byStudent.set(sp.user.email, list);
    }
  }

  console.log('  Verified quiz assignments (from DB):');
  for (const [email, quizIds] of byStudent) {
    const sorted = quizIds.sort();
    console.log(`    ${email} → ${sorted.join(', ')}`);
  }
  console.log('');

  console.log('  Test accounts (password: Password123!):');
  console.log(`    admin1@example.com   (ADMIN)`);
  console.log(`    student1@example.com (STUDENT) → quiz-1, quiz-2`);
  console.log(`    student2@example.com (STUDENT) → quiz-1, quiz-4`);
  console.log('');
  console.log('  Quizzes:');
  console.log(`    quiz-1: Sprint 1 Assessment (PUBLISHED, active, 5 questions)`);
  console.log(`    quiz-2: Practice Quiz (PUBLISHED, no window, 3 questions)`);
  console.log(`    quiz-3: Draft Quiz (DRAFT, no questions)`);
  console.log(`    quiz-4: Closed Quiz (PUBLISHED, closed window, 2 questions)`);
  console.log('');
  console.log('  Attempts:');
  console.log(`    student1 → quiz-1: IN_PROGRESS`);
  console.log(`    student1 → quiz-2: SUBMITTED (80/100)`);
  console.log(`    student2 → quiz-1: SUBMITTED (100/100)`);
  console.log(`    student2 → quiz-1: SUBMITTED (60/100)`);
  console.log(`    student2 → quiz-4: TIMED_OUT`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/quiz_service?schema=public',
  });

  const prisma = new PrismaClient({ adapter });

  console.log('🌱 Starting seed...');
  console.log('');

  await seedLiveTestFixtures(prisma);
  await seedFeatureTestData(prisma);

  console.log('✅ Seed complete.');

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
