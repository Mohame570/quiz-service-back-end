import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { QuizService } from './services/quiz.service';
import { QuizController } from './controllers/quiz.controller';
import { QuestionsModule } from '../questions/questions.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, QuestionsModule, AuthModule, NotificationsModule],
  controllers: [QuizController],
  providers: [QuizService],
})
export class QuizModule {}
