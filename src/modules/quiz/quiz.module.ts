import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { QuizService } from './services/quiz.service';
import { QuizController } from './controllers/quiz.controller';

@Module({
  imports: [PrismaModule],
  controllers: [QuizController],
  providers: [QuizService],
})
export class QuizModule {}
