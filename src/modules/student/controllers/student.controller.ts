import {
  Controller,
  Get,
  Param,
  Request,
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
    return this.studentService.getQuizInstructions(
      req.user!.sub,
      id,
    );
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
    const attempt = await this.studentService.getActiveAttempt(
      req.user!.sub,
    );
    return { attempt };
  }
}
