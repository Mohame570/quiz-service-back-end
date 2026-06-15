import 'dotenv/config';

import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';

import {
  EmailDeliveryStatus,
  NotificationTemplateKey,
  PrismaClient,
  QuizStatus,
  UserRole,
} from '../src/generated/prisma/client';

const LIVE_TEST_CORRELATION_ID = 'live-test:failed-verification';

async function main(): Promise<void> {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5433/quiz_service?schema=public',
  });

  const prisma = new PrismaClient({ adapter });

  const passwordHash = await bcrypt.hash('Password123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@live-test.example' },
    update: { passwordHash, name: 'Live Test Admin', role: UserRole.ADMIN },
    create: {
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

  const quiz = await prisma.quiz.upsert({
    where: { id: 'seed-live-test-quiz' },
    update: {
      title: 'Live Test Quiz',
      description: 'Seeded quiz for live server smoke tests',
      status: QuizStatus.PUBLISHED,
      createdById: admin.id,
    },
    create: {
      id: 'seed-live-test-quiz',
      title: 'Live Test Quiz',
      description: 'Seeded quiz for live server smoke tests',
      status: QuizStatus.PUBLISHED,
      durationMinutes: 30,
      passingScore: 70,
      createdById: admin.id,
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

  console.log('Seed complete.');
  console.log(`  admin:   ${admin.email} / Password123!`);
  console.log(`  student: ${student.email} / Password123!`);
  console.log(`  quiz:    ${quiz.title} (${quiz.id})`);
  console.log(`  failed delivery log correlationId: ${LIVE_TEST_CORRELATION_ID}`);

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
