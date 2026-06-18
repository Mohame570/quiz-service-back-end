import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/quiz_service?schema=public',
  });
  const prisma = new PrismaClient({ adapter });

  const student1 = await prisma.user.findUnique({
    where: { email: 'student1@example.com' },
    include: { studentProfile: { include: { quizzes: true } } },
  });

  console.log('Student1:', student1?.email);
  console.log('Student1 ID:', student1?.id);
  console.log('Student Profile:', student1?.studentProfile);
  console.log('Quizzes assigned:', student1?.studentProfile?.quizzes.map(q => q.id));

  const quizzes = await prisma.quiz.findMany({
    where: {
      status: 'PUBLISHED',
      students: { some: { userId: student1?.id } },
    },
  });

  console.log('\nQuizzes found for student1:', quizzes.length);
  quizzes.forEach(q => console.log(`  - ${q.id}: ${q.title}`));

  await prisma.$disconnect();
}

main().catch(console.error);
