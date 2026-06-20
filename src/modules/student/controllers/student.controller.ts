import {
  Controller,
  Get,
  Param,
  Request,
  UseGuards,
  UseGuards,
} from '@nestjs/common';

import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from '../../auth/guards/jwt-auth.guard';
import { StudentService } from '../services/student.service';
import {
  StudentActiveAttemptResponseDto,
  StudentQuizInstructionsDto,
  StudentQuizListResponseDto,
} from '../dto';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../../auth/guards/email-verified.guard';

// ---------------------------------------------------------------------------
// NOTE: @UseGuards(AuthGuard) and @Request() req.user are stubbed below.
// Mirrors the pattern used in L5's attempts controller:
//   - L1 Auth will provide the real JWT guard.
//   - For now, the student id is read from req.user.sub.
//   - If absent, a stub id is used so the endpoint is testable in isolation.
// ---------------------------------------------------------------------------

function resolveStudentId(req: any): string {
  return req.user?.sub;
}

@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
@Controller('student')
@UseGuards(JwtAuthGuard)
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  /**
   * GET /api/student/quizzes
   * Dashboard list of PUBLISHED quizzes that the current student can start.
   */
  @Get('quizzes')
  async listQuizzes(
    @Request() req: AuthenticatedRequest,
  ): Promise<StudentQuizListResponseDto> {
    return this.studentService.listQuizzesForStudent(req.user!.sub);
  }

  /**
   * GET /api/student/quizzes/:id
   * Quiz instructions / pre-start screen.
   * Throws 404 if the quiz is not PUBLISHED.
   */
  @Get('quizzes/:id')
  async getQuizInstructions(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<StudentQuizInstructionsDto> {
    return this.studentService.getQuizInstructions(req.user!.sub, id);
  }

  /**
   * GET /api/student/attempts/active
   * Returns the most recent IN_PROGRESS attempt for the current student,
   * wrapped in `{ attempt: ... }`. The inner value is `null` if none.
   * Useful for resume-after-reload.
   */
  @Get('attempts/active')
  async getActiveAttempt(
    @Request() req: AuthenticatedRequest,
  ): Promise<StudentActiveAttemptResponseDto> {
    const attempt = await this.studentService.getActiveAttempt(req.user!.sub);
    return { attempt };
  }
}
