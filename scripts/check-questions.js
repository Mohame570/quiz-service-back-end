const { PrismaClient } = require('./src/generated/prisma');

async function main() {
  const prisma = new PrismaClient();
  try {
    const count = await prisma.question.count();
    console.log('QUESTION_COUNT=' + count);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
