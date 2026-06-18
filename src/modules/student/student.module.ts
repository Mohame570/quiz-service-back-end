import { Module } from '@nestjs/common';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StudentController } from './controllers/student.controller';
import { StudentService } from './services/student.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StudentController],
  providers: [StudentService],
})
export class StudentModule {}
