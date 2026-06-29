import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AttemptsModule } from '../attempts/attempts.module';
import { AuthModule } from '../auth/auth.module';
import { QuestionsModule } from '../questions/questions.module';
import { StudentController } from './controllers/student.controller';
import { StudentRoleGuard } from './guards/student-role.guard';
import { StudentAttemptOrchestrator } from './services/student-attempt-orchestrator';
import { StudentService } from './services/student.service';

@Module({
  imports: [PrismaModule, AuthModule, AttemptsModule, QuestionsModule],
  controllers: [StudentController],
  providers: [StudentService, StudentAttemptOrchestrator, StudentRoleGuard],
})
export class StudentModule {}
