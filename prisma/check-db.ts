import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

async function main() {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/quiz_service?schema=public',
  });

  const prisma = new PrismaClient({ adapter });

  console.log('📊 Database Status:');
  console.log('');

  // Users
  const users = await prisma.user.count();
  console.log(`👤 Users: ${users}`);
  const userList = await prisma.user.findMany({
    select: { email: true, name: true, role: true, emailVerified: true },
  });
  userList.forEach((u) =>
    console.log(`   - ${u.email} (${u.role}) ${u.emailVerified ? '✓' : '✗'}`),
  );
  console.log('');

  // Student Profiles
  const profiles = await prisma.studentProfile.count();
  console.log(`🎓 Student Profiles: ${profiles}`);
  console.log('');

  // Quizzes
  const quizzes = await prisma.quiz.count();
  console.log(`📝 Quizzes: ${quizzes}`);
  const quizList = await prisma.quiz.findMany({
    select: { id: true, title: true, status: true, durationMinutes: true },
    orderBy: { createdAt: 'asc' },
  });
  quizList.forEach((q) =>
    console.log(`   - ${q.id}: ${q.title} (${q.status}, ${q.durationMinutes ?? ''} min)`),
  );
  console.log('');

  // Questions per quiz
  const questions = await prisma.question.count();
  console.log(`❓ Questions: ${questions}`);
  const questionCounts = await prisma.quiz.findMany({
    select: {
      id: true,
      title: true,
      _count: { select: { questions: true } },
    },
  });
  questionCounts.forEach((q) =>
    console.log(`   - ${q.id}: ${q.title} → ${q._count.questions} questions`),
  );
  console.log('');

  // Attempts
  const attempts = await prisma.attempt.count();
  console.log(`📊 Attempts: ${attempts}`);
  const attemptList = await prisma.attempt.findMany({
    select: {
      id: true,
      quizId: true,
      studentId: true,
      status: true,
      score: true,
      maxScore: true,
    },
    orderBy: { startedAt: 'desc' },
  });
  attemptList.forEach((a) => {
    const scoreStr = a.score !== null ? `${a.score}/${a.maxScore}` : '-';
    console.log(`   - ${a.studentId} → ${a.quizId}: ${a.status} (score: ${scoreStr})`);
  });
  console.log('');

  // Email Delivery Logs
  const logs = await prisma.emailDeliveryLog.count();
  console.log(` Email Logs: ${logs}`);
  const logCounts = await prisma.emailDeliveryLog.groupBy({
    by: ['status'],
    _count: true,
  });
  logCounts.forEach((l) => console.log(`   - ${l.status}: ${l._count}`));
  console.log('');

  // Quiz → Student assignments
  console.log('🔗 Quiz → Student assignments:');
  const assignedQuizzes = await prisma.quiz.findMany({
    select: {
      id: true,
      title: true,
      students: {
        select: { user: { select: { email: true } } },
      },
    },
    orderBy: { id: 'asc' },
  });
  let assignmentCount = 0;
  for (const q of assignedQuizzes) {
    if (q.students.length === 0) {
      console.log(`   - ${q.id} (${q.title}): (no students assigned)`);
    } else {
      const emails = q.students.map((s) => s.user.email).join(', ');
      console.log(`   - ${q.id} (${q.title}) → ${emails}`);
      assignmentCount += q.students.length;
    }
  }
  console.log(`   Total assignments: ${assignmentCount}`);
  console.log('');

  // Per-student assignment summary
  console.log('🎓 Per-student quiz lists:');
  const students = await prisma.studentProfile.findMany({
    select: {
      user: { select: { email: true } },
      quizzes: { select: { id: true, title: true } },
    },
  });
  for (const s of students) {
    if (s.quizzes.length === 0) {
      console.log(`   - ${s.user.email}: (none)`);
    } else {
      const list = s.quizzes.map((q) => q.id).sort().join(', ');
      console.log(`   - ${s.user.email} → ${list}`);
    }
  }
  console.log('');

  await prisma.$disconnect();
}

main().catch(console.error);
