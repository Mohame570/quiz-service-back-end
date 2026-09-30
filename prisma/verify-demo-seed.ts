import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// Double-seed checklist: run twice, diff the outputs — must be identical.
async function main() {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/quiz_service?schema=public',
  });
  const prisma = new PrismaClient({ adapter });

  const certs = await prisma.certificate.findMany({
    where: { code: { in: ['CERT-DEMO01', 'CERT-DEMO02'] } },
    select: { code: true, score: true, maxScore: true, percentage: true },
    orderBy: { code: 'asc' },
  });
  const quiz = await prisma.quiz.findUnique({
    where: { id: 'demo-quiz-1' },
    select: { id: true, title: true, passingScore: true, maxAttempts: true },
  });
  const questions = await prisma.question.findMany({
    where: { id: { startsWith: 'demo-q-' } },
    select: { id: true, type: true, topic: true },
    orderBy: { id: 'asc' },
  });
  const attempts = await prisma.attempt.findMany({
    where: { id: { startsWith: 'demo-att-' } },
    select: { id: true, status: true, score: true, maxScore: true },
    orderBy: { id: 'asc' },
  });
  const results = await prisma.result.findMany({
    where: { attemptId: { startsWith: 'demo-att-' } },
    select: { attemptId: true, score: true, passed: true },
    orderBy: { attemptId: 'asc' },
  });
  const cheats = await prisma.cheatingEventLog.count({
    where: { attemptId: { startsWith: 'demo-att-' } },
  });

  console.log(
    JSON.stringify(
      { certs, quiz, questions, attempts, results, cheats },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
