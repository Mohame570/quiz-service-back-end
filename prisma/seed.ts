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
  CheatingEventType,
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
  const cleanupQuizIds = [
    'quiz-1', 'quiz-2', 'quiz-3', 'quiz-4',
    'new-quiz-1', 'new-quiz-2', 'new-quiz-3', 'new-quiz-4', 'new-quiz-5',
  ];
  await prisma.attempt.deleteMany({
    where: { quizId: { in: cleanupQuizIds } },
  });
  await prisma.question.deleteMany({
    where: { 
      quizQuestions: {
        some: { quizId: { in: cleanupQuizIds } }
      } 
    },
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

  await prisma.quiz.upsert({
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

  // ---- New quizzes (no attempts seeded — user creates them via the API) ----
  const newQuiz1 = await prisma.quiz.upsert({
    where: { id: 'new-quiz-1' },
    update: {
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
    create: {
      id: 'new-quiz-1',
      title: 'JavaScript Fundamentals',
      description: 'Core JavaScript concepts and language features',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 30,
      passingScore: 70,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T23:59:59Z'),
      createdById: admin1.id,
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
  });

  // new-quiz-2: 1 minute duration — use to test timeout / auto-finalise scenarios
  const newQuiz2 = await prisma.quiz.upsert({
    where: { id: 'new-quiz-2' },
    update: {
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
    create: {
      id: 'new-quiz-2',
      title: 'World Geography',
      description: 'Countries, capitals, and physical geography',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 1,
      passingScore: 60,
      createdById: admin1.id,
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
  });

  const newQuiz3 = await prisma.quiz.upsert({
    where: { id: 'new-quiz-3' },
    update: {
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
    create: {
      id: 'new-quiz-3',
      title: 'Database Basics',
      description: 'Relational database fundamentals and SQL',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 25,
      passingScore: 70,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T23:59:59Z'),
      createdById: admin1.id,
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
  });

  const newQuiz4 = await prisma.quiz.upsert({
    where: { id: 'new-quiz-4' },
    update: {
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
    create: {
      id: 'new-quiz-4',
      title: 'Web Development',
      description: 'HTTP, REST, JWT, CORS, and CSS fundamentals',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 30,
      passingScore: 70,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T23:59:59Z'),
      createdById: admin1.id,
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
  });

  const newQuiz5 = await prisma.quiz.upsert({
    where: { id: 'new-quiz-5' },
    update: {
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
    create: {
      id: 'new-quiz-5',
      title: 'Algorithms & Data Structures',
      description: 'Complexity, sorting, searching, and hash tables',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 45,
      passingScore: 70,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T23:59:59Z'),
      createdById: admin1.id,
      students: { connect: [{ userId: student1.id }, { userId: student2.id }] },
    },
  });

  // ---- Questions ----
  // Quiz 1: 5 questions (3 MCQ + 2 TRUE_FALSE)
  const q1_1 = await prisma.question.create({
    data: {
      quizId: quiz1.id,
      type: QuestionType.MCQ,
      text: 'Which data structure uses LIFO (Last In, First Out) ordering?',
      options: ['Queue', 'Stack', 'Linked List', 'Tree'],
      correctAnswer: 'Stack',
    },
  });

  const q1_2 = await prisma.question.create({
    data: {
      quizId: quiz1.id,
      type: QuestionType.MCQ,
      text: 'In Git, which command is used to save changes to the local repository?',
      options: ['git push', 'git commit', 'git add', 'git save'],
      correctAnswer: 'git commit',
    },
  });

  const q1_3 = await prisma.question.create({
    data: {
      quizId: quiz1.id,
      type: QuestionType.MCQ,
      text: 'Which protocol is used for secure communication over a computer network?',
      options: ['HTTP', 'FTP', 'HTTPS', 'SMTP'],
      correctAnswer: 'HTTPS',
    },
  });

  const q1_4 = await prisma.question.create({
    data: {
      quizId: quiz1.id,
      type: QuestionType.TRUE_FALSE,
      text: 'A primary key in a relational database must be unique for each record.',
      options: ['True', 'False'],
      correctAnswer: 'True',
    },
  });

  const q1_5 = await prisma.question.create({
    data: {
      quizId: quiz1.id,
      type: QuestionType.TRUE_FALSE,
      text: 'In JavaScript, the "===" operator performs type coercion before comparison.',
      options: ['True', 'False'],
      correctAnswer: 'False',
    },
  });

  // Quiz 2: 3 questions (2 MCQ + 1 TRUE_FALSE)
  const q2_1 = await prisma.question.create({
    data: {
      quizId: quiz2.id,
      type: QuestionType.MCQ,
      text: 'Which HTTP method is typically used to create a new resource?',
      options: ['GET', 'POST', 'PUT', 'DELETE'],
      correctAnswer: 'POST',
    },
  });

  const q2_2 = await prisma.question.create({
    data: {
      quizId: quiz2.id,
      type: QuestionType.MCQ,
      text: 'What is the standard port for HTTPS?',
      options: ['80', '443', '21', '22'],
      correctAnswer: '443',
    },
  });

  const q2_3 = await prisma.question.create({
    data: {
      quizId: quiz2.id,
      type: QuestionType.TRUE_FALSE,
      text: 'REST APIs always return data in XML format.',
      options: ['True', 'False'],
      correctAnswer: 'False',
    },
  });

  // Quiz 4: 2 questions (1 MCQ + 1 TRUE_FALSE)
  await prisma.question.create({
    data: {
      quizId: quiz4.id,
      type: QuestionType.MCQ,
      text: 'What does CSS stand for?',
      options: ['Cascading Style Sheets', 'Creative Style System', 'Computer Style Sheets', 'Colorful Style Sheets'],
      correctAnswer: 'Cascading Style Sheets',
    },
  });

  await prisma.question.create({
    data: {
      quizId: quiz4.id,
      type: QuestionType.TRUE_FALSE,
      text: 'Docker containers share the host machine OS kernel.',
      options: ['True', 'False'],
      correctAnswer: 'True',
    },
  });

  // ---- New questions ----
  // new-quiz-1: JavaScript Fundamentals — 4 questions (3 MCQ + 1 TF)
  await prisma.question.create({
    data: {
      quizId: newQuiz1.id,
      type: QuestionType.MCQ,
      text: 'Which keyword declares a block-scoped variable in JavaScript?',
      options: ['var', 'let', 'const', 'static'],
      correctAnswer: 'let',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz1.id,
      type: QuestionType.MCQ,
      text: 'What does `typeof null` return in JavaScript?',
      options: ['null', 'undefined', 'object', 'number'],
      correctAnswer: 'object',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz1.id,
      type: QuestionType.MCQ,
      text: 'Which method adds an element to the end of an array?',
      options: ['push', 'pop', 'shift', 'unshift'],
      correctAnswer: 'push',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz1.id,
      type: QuestionType.TRUE_FALSE,
      text: 'JavaScript is a single-threaded language.',
      options: ['True', 'False'],
      correctAnswer: 'True',
    },
  });

  // new-quiz-2: World Geography — 3 questions (2 MCQ + 1 TF) — 1 min duration
  await prisma.question.create({
    data: {
      quizId: newQuiz2.id,
      type: QuestionType.MCQ,
      text: 'What is the capital of Japan?',
      options: ['Seoul', 'Beijing', 'Tokyo', 'Bangkok'],
      correctAnswer: 'Tokyo',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz2.id,
      type: QuestionType.MCQ,
      text: 'Which is the largest hot desert in the world?',
      options: ['Gobi', 'Sahara', 'Kalahari', 'Atacama'],
      correctAnswer: 'Sahara',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz2.id,
      type: QuestionType.TRUE_FALSE,
      text: 'The Amazon River flows through Brazil.',
      options: ['True', 'False'],
      correctAnswer: 'True',
    },
  });

  // new-quiz-3: Database Basics — 4 questions (3 MCQ + 1 TF)
  await prisma.question.create({
    data: {
      quizId: newQuiz3.id,
      type: QuestionType.MCQ,
      text: 'Which SQL clause is used to filter rows?',
      options: ['ORDER BY', 'GROUP BY', 'WHERE', 'HAVING'],
      correctAnswer: 'WHERE',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz3.id,
      type: QuestionType.MCQ,
      text: 'What does the ACID acronym stand for in databases?',
      options: [
        'Atomicity, Consistency, Isolation, Durability',
        'Availability, Consistency, Isolation, Delivery',
        'Atomicity, Cache, Integrity, Durability',
        'Aggregation, Consistency, Isolation, Durability',
      ],
      correctAnswer: 'Atomicity, Consistency, Isolation, Durability',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz3.id,
      type: QuestionType.MCQ,
      text: 'A foreign key can reference a unique index in another table.',
      options: ['True', 'False'],
      correctAnswer: 'True',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz3.id,
      type: QuestionType.MCQ,
      text: 'Which type of index is generally the fastest for equality lookups?',
      options: ['B-tree', 'Hash', 'GIN', 'GIST'],
      correctAnswer: 'Hash',
    },
  });

  // new-quiz-4: Web Development — 5 questions (4 MCQ + 1 TF)
  await prisma.question.create({
    data: {
      quizId: newQuiz4.id,
      type: QuestionType.MCQ,
      text: 'What does HTTP stand for?',
      options: [
        'HyperText Transfer Protocol',
        'High Transfer Text Protocol',
        'HyperText Transport Protocol',
        'HyperText Transaction Protocol',
      ],
      correctAnswer: 'HyperText Transfer Protocol',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz4.id,
      type: QuestionType.MCQ,
      text: 'Which HTTP status code indicates a resource was created?',
      options: ['200', '201', '204', '301'],
      correctAnswer: '201',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz4.id,
      type: QuestionType.MCQ,
      text: 'Which header is typically used to send a JWT in a request?',
      options: ['X-Auth-Token', 'Cookie', 'Authorization', 'X-API-Key'],
      correctAnswer: 'Authorization',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz4.id,
      type: QuestionType.TRUE_FALSE,
      text: 'CORS stands for Cross-Origin Resource Sharing.',
      options: ['True', 'False'],
      correctAnswer: 'True',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz4.id,
      type: QuestionType.MCQ,
      text: 'Which CSS property changes the text color of an element?',
      options: ['background', 'font-color', 'text-color', 'color'],
      correctAnswer: 'color',
    },
  });

  // new-quiz-5: Algorithms & Data Structures — 4 questions (3 MCQ + 1 TF)
  await prisma.question.create({
    data: {
      quizId: newQuiz5.id,
      type: QuestionType.MCQ,
      text: 'What is the worst-case time complexity of binary search on a sorted array?',
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
      correctAnswer: 'O(log n)',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz5.id,
      type: QuestionType.TRUE_FALSE,
      text: 'A stack follows FIFO (First In, First Out) order.',
      options: ['True', 'False'],
      correctAnswer: 'False',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz5.id,
      type: QuestionType.MCQ,
      text: 'What is the space complexity of merge sort?',
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
      correctAnswer: 'O(n)',
    },
  });
  await prisma.question.create({
    data: {
      quizId: newQuiz5.id,
      type: QuestionType.TRUE_FALSE,
      text: 'A hash table provides O(1) average-case lookup time.',
      options: ['True', 'False'],
      correctAnswer: 'True',
    },
  });

  // ---- Attempts ----
  // expiresAt = startedAt + quiz.durationMinutes minutes
  // Attempt 1: student1 → Quiz 1 (IN_PROGRESS, started 1h ago)
  const attempt1StartedAt = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.attempt.create({
    data: {
      quizId: quiz1.id,
      studentId: student1.id,
      status: AttemptStatus.IN_PROGRESS,
      startedAt: attempt1StartedAt,
      expiresAt: new Date(attempt1StartedAt.getTime() + (quiz1.durationMinutes ?? 30) * 60_000),
    },
  });

  // Attempt 2: student1 → Quiz 2 (SUBMITTED, score: 80/100, 3 answers)
  const attempt2StartedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const attempt2 = await prisma.attempt.create({
    data: {
      quizId: quiz2.id,
      studentId: student1.id,
      status: AttemptStatus.SUBMITTED,
      startedAt: attempt2StartedAt,
      expiresAt: new Date(attempt2StartedAt.getTime() + (quiz2.durationMinutes ?? 15) * 60_000),
      submittedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + 10 * 60 * 1000),
      score: 80,
      maxScore: 100,
    },
  });

  await prisma.attemptAnswer.createMany({
    data: [
      { attemptId: attempt2.id, questionId: q2_1.id, selectedOptionId: 'POST', isCorrect: true },
      { attemptId: attempt2.id, questionId: q2_2.id, selectedOptionId: '443', isCorrect: true },
      { attemptId: attempt2.id, questionId: q2_3.id, selectedOptionId: 'False', isCorrect: true },
    ],
  });

  // Attempt 3: student2 → Quiz 1 (SUBMITTED, score: 100/100, 5 answers)
  const attempt3StartedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const attempt3 = await prisma.attempt.create({
    data: {
      quizId: quiz1.id,
      studentId: student2.id,
      status: AttemptStatus.SUBMITTED,
      startedAt: attempt3StartedAt,
      expiresAt: new Date(attempt3StartedAt.getTime() + (quiz1.durationMinutes ?? 30) * 60_000),
      submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000),
      score: 100,
      maxScore: 100,
    },
  });

  await prisma.attemptAnswer.createMany({
    data: [
      { attemptId: attempt3.id, questionId: q1_1.id, selectedOptionId: 'Stack', isCorrect: true },
      { attemptId: attempt3.id, questionId: q1_2.id, selectedOptionId: 'git commit', isCorrect: true },
      { attemptId: attempt3.id, questionId: q1_3.id, selectedOptionId: 'HTTPS', isCorrect: true },
      { attemptId: attempt3.id, questionId: q1_4.id, selectedOptionId: 'True', isCorrect: true },
      { attemptId: attempt3.id, questionId: q1_5.id, selectedOptionId: 'False', isCorrect: true },
    ],
  });

  // Attempt 4: student2 → Quiz 4 (TIMED_OUT, no answers)
  const attempt4StartedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.attempt.create({
    data: {
      quizId: quiz4.id,
      studentId: student2.id,
      status: AttemptStatus.TIMED_OUT,
      startedAt: attempt4StartedAt,
      expiresAt: new Date(attempt4StartedAt.getTime() + (quiz4.durationMinutes ?? 20) * 60_000),
    },
  });

  // Attempt 5: student2 → Quiz 1 (SUBMITTED, score: 60/100, 5 answers, 3 correct)
  const attempt5StartedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const attempt5 = await prisma.attempt.create({
    data: {
      quizId: quiz1.id,
      studentId: student2.id,
      status: AttemptStatus.SUBMITTED,
      startedAt: attempt5StartedAt,
      expiresAt: new Date(attempt5StartedAt.getTime() + (quiz1.durationMinutes ?? 30) * 60_000),
      submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000),
      score: 60,
      maxScore: 100,
    },
  });

  await prisma.attemptAnswer.createMany({
    data: [
      { attemptId: attempt5.id, questionId: q1_1.id, selectedOptionId: 'Stack', isCorrect: true },
      { attemptId: attempt5.id, questionId: q1_2.id, selectedOptionId: 'git push', isCorrect: false },
      { attemptId: attempt5.id, questionId: q1_3.id, selectedOptionId: 'HTTPS', isCorrect: true },
      { attemptId: attempt5.id, questionId: q1_4.id, selectedOptionId: 'False', isCorrect: false },
      { attemptId: attempt5.id, questionId: q1_5.id, selectedOptionId: 'False', isCorrect: true },
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
      correlationId: 'invitation:quiz-1',
      metadata: { quizId: 'quiz-1' },
    },
  });

  await prisma.emailDeliveryLog.create({
    data: {
      recipientEmail: 'student1@example.com',
      subject: 'Quiz invitation: Practice Quiz',
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
      status: EmailDeliveryStatus.PENDING,
      attemptCount: 0,
      correlationId: 'invitation:quiz-2',
      metadata: { quizId: 'quiz-2' },
    },
  });

  await prisma.emailDeliveryLog.create({
    data: {
      recipientEmail: 'student1@example.com',
      subject: 'Quiz invitation: JavaScript Fundamentals',
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
      status: EmailDeliveryStatus.SENT,
      attemptCount: 1,
      correlationId: 'invitation:new-quiz-1',
      metadata: { quizId: 'new-quiz-1' },
    },
  });

  await prisma.emailDeliveryLog.create({
    data: {
      recipientEmail: 'student2@example.com',
      subject: 'Quiz invitation: Database Basics',
      templateKey: NotificationTemplateKey.QUIZ_INVITATION,
      status: EmailDeliveryStatus.FAILED,
      attemptCount: 3,
      errorMessage: 'Connection timeout after 30s',
      correlationId: 'invitation:new-quiz-3',
      metadata: { quizId: 'new-quiz-3' },
    },
  });

  // ---- Cheating Event Logs (for admin integrity demo) ----
  // Attempt 1 (IN_PROGRESS) — 8 events, flagged at threshold ≤ 8
  const cheatingEvents = [
    { attemptId: attempt1StartedAt, eventType: 'TAB_HIDDEN' as const, description: 'Student switched tab during quiz' },
    { eventType: 'WINDOW_BLUR' as const, description: 'Quiz window lost focus' },
    { eventType: 'WINDOW_FOCUS' as const, description: 'Quiz window regained focus' },
    { eventType: 'TAB_HIDDEN' as const, description: 'Student switched tab again' },
    { eventType: 'FULLSCREEN_EXIT' as const, description: 'Exited fullscreen mode' },
    { eventType: 'TAB_HIDDEN' as const, description: 'Tab hidden a third time' },
    { eventType: 'WINDOW_BLUR' as const, description: 'Window lost focus again' },
    { eventType: 'COPY_PASTE' as const, description: 'Student attempted to copy text' },
  ];

  for (const evt of cheatingEvents) {
    await prisma.cheatingEventLog.create({
      data: {
        attemptId: (await prisma.attempt.findFirst({ where: { studentId: student1.id, quizId: quiz1.id, status: 'IN_PROGRESS' }, select: { id: true } }))!.id,
        eventType: evt.eventType,
        description: evt.description,
        occurredAt: new Date(Date.now() - Math.random() * 60 * 60 * 1000),
      },
    });
  }

  // Attempt 2 (SUBMITTED, 80/100) — 2 events, not flagged at default threshold
  for (let i = 0; i < 2; i++) {
    await prisma.cheatingEventLog.create({
      data: {
        attemptId: attempt2.id,
        eventType: i === 0 ? 'TAB_HIDDEN' : 'COPY_PASTE',
        description: i === 0 ? 'Quick tab switch' : 'Copy attempt during quiz',
        occurredAt: new Date(Date.now() - (2 + i) * 60 * 60 * 1000),
      },
    });
  }

  // Attempt 3 (SUBMITTED, 100/100) — 0 events, clean student
  // Attempt 5 (SUBMITTED, 60/100) — 12 events, severe case
  const severeEventTypes: CheatingEventType[] = [
    CheatingEventType.TAB_HIDDEN,
    CheatingEventType.WINDOW_BLUR,
    CheatingEventType.COPY_PASTE,
    CheatingEventType.FULLSCREEN_EXIT,
    CheatingEventType.WINDOW_FOCUS
  ];
  for (let i = 0; i < 12; i++) {
    await prisma.cheatingEventLog.create({
      data: {
        attemptId: attempt5.id,
        eventType: severeEventTypes[i % severeEventTypes.length],
        description: `Suspicious activity #${i + 1}`,
        occurredAt: new Date(Date.now() - (120 + i * 10) * 60 * 1000),
      },
    });
  }

  console.log('  ✓ Feature test data seeded');
  console.log('');

  // ---- Verify assignments in join table ----
  const assignments = await prisma.quiz.findMany({
    where: { id: { in: cleanupQuizIds } },
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
  console.log(`    student1@example.com (STUDENT) → new-quiz-1, new-quiz-2, new-quiz-3, new-quiz-4, new-quiz-5, quiz-1, quiz-2`);
  console.log(`    student2@example.com (STUDENT) → new-quiz-1, new-quiz-2, new-quiz-3, new-quiz-4, new-quiz-5, quiz-1, quiz-4`);
  console.log('');
  console.log('  Quizzes:');
  console.log(`    quiz-1:      Sprint 1 Assessment      (PUBLISHED, active, 5 questions)`);
  console.log(`    quiz-2:      Practice Quiz            (PUBLISHED, no window, 3 questions)`);
  console.log(`    quiz-3:      Draft Quiz              (DRAFT, no questions)`);
  console.log(`    quiz-4:      Closed Quiz             (PUBLISHED, closed window, 2 questions)`);
  console.log(`    new-quiz-1:  JavaScript Fundamentals  (PUBLISHED, active, 30 min, 4 questions)`);
  console.log(`    new-quiz-2:  World Geography          (PUBLISHED, no window, 1 min, 3 questions)  ← timeout test`);
  console.log(`    new-quiz-3:  Database Basics          (PUBLISHED, active, 25 min, 4 questions)`);
  console.log(`    new-quiz-4:  Web Development         (PUBLISHED, active, 30 min, 5 questions)`);
  console.log(`    new-quiz-5:  Algorithms & DS         (PUBLISHED, active, 45 min, 4 questions)`);
  console.log('');
  console.log('  Attempts (pre-seeded, for the 4 old quizzes only — new quizzes have 0 attempts):');
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
