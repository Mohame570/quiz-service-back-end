import {
  Controller,
  Get,
  Param,
  Request,
} from '@nestjs/common';

import { StudentService } from '../services/student.service';
import {
  StudentActiveAttemptResponseDto,
  StudentQuizInstructionsDto,
  StudentQuizListResponseDto,
} from '../dto';

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

@Controller('student')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  /**
   * GET /api/student/quizzes
   * Dashboard list of PUBLISHED quizzes that the current student can start.
   */
  @Get('quizzes')
  async listQuizzes(@Request() req: any): Promise<StudentQuizListResponseDto> {
    return this.studentService.listQuizzesForStudent(resolveStudentId(req));
  }

  /**
   * GET /api/student/quizzes/:id
   * Quiz instructions / pre-start screen.
   * Throws 404 if the quiz is not PUBLISHED.
   */
  @Get('quizzes/:id')
  async getQuizInstructions(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<StudentQuizInstructionsDto> {
    return this.studentService.getQuizInstructions(
      resolveStudentId(req),
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
    @Request() req: any,
  ): Promise<StudentActiveAttemptResponseDto> {
    const attempt = await this.studentService.getActiveAttempt(
      resolveStudentId(req),
    );
    return { attempt };
  }
}
