import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../../auth/guards/email-verified.guard';
import {
  StudentActiveAttemptResponseDto,
  StudentAttemptAnswerDto,
  StudentAttemptQuestionsResponseDto,
  StudentAttemptResponseDto,
  StudentQuizInstructionsDto,
  StudentQuizListResponseDto,
  StudentSaveAnswersDto,
  StudentSubmitAttemptDto,
} from '../dto';
import { StudentRoleGuard } from '../guards/student-role.guard';
import { StudentService } from '../services/student.service';

// ---------------------------------------------------------------------------
// The Student controller is the public API surface for the frontend.
// Frontend must not call /api/attempts, /api/questions, or /api/quizzes
// directly. All quiz-solving flows are exposed under /api/student.
// ---------------------------------------------------------------------------

@UseGuards(JwtAuthGuard, EmailVerifiedGuard, StudentRoleGuard)
@Controller('student')
@UseGuards(JwtAuthGuard)
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  // -------------------------------------------------------------------------
  // GET /api/student/quizzes
  // -------------------------------------------------------------------------

  @Get('quizzes')
  async listQuizzes(@Request() req: any): Promise<StudentQuizListResponseDto> {
    return this.studentService.listQuizzesForStudent(req.user.sub);
  }

  // -------------------------------------------------------------------------
  // GET /api/student/quizzes/:quizId
  // -------------------------------------------------------------------------

  @Get('quizzes/:quizId')
  async getQuizInstructions(
    @Param('quizId', new ParseUUIDPipe()) quizId: string,
    @Request() req: any,
  ): Promise<StudentQuizInstructionsDto> {
    return this.studentService.getQuizInstructions(req.user.sub, quizId);
  }

  // -------------------------------------------------------------------------
  // POST /api/student/quizzes/:quizId/start
  // -------------------------------------------------------------------------

  @Post('quizzes/:quizId/start')
  async startQuizAttempt(
    @Param('quizId', new ParseUUIDPipe()) quizId: string,
    @Request() req: any,
  ): Promise<StudentAttemptResponseDto> {
    return this.studentService.startAttempt(req.user.sub, quizId);
  }

  // -------------------------------------------------------------------------
  // GET /api/student/attempts/active
  // -------------------------------------------------------------------------

  @Get('attempts/active')
  async getActiveAttempt(
    @Request() req: any,
  ): Promise<StudentActiveAttemptResponseDto> {
    return this.studentService.getActiveAttempt(req.user.sub);
  }

  // -------------------------------------------------------------------------
  // GET /api/student/attempts/:attemptId/questions
  // -------------------------------------------------------------------------

  @Get('attempts/:attemptId/questions')
  async getAttemptQuestions(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Request() req: any,
  ): Promise<StudentAttemptQuestionsResponseDto> {
    return this.studentService.getAttemptQuestions(req.user.sub, attemptId);
  }

  // -------------------------------------------------------------------------
  // PATCH /api/student/attempts/:attemptId/answers
  // -------------------------------------------------------------------------

  @Patch('attempts/:attemptId/answers')
  async saveAnswers(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() dto: StudentSaveAnswersDto,
    @Request() req: any,
  ): Promise<StudentAttemptAnswerDto[]> {
    return this.studentService.saveAttemptAnswers(
      req.user.sub,
      attemptId,
      dto.answers,
    );
  }

  // -------------------------------------------------------------------------
  // POST /api/student/attempts/:attemptId/submit
  // -------------------------------------------------------------------------

  @Post('attempts/:attemptId/submit')
  async submitAttempt(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() dto: StudentSubmitAttemptDto,
    @Request() req: any,
  ): Promise<StudentAttemptResponseDto> {
    return this.studentService.submitAttempt(
      req.user.sub,
      attemptId,
      dto.answers ?? [],
    );
  }

  // -------------------------------------------------------------------------
  // GET /api/student/attempts/:attemptId/result
  // -------------------------------------------------------------------------

  @Get('attempts/:attemptId/result')
  async getAttemptResult(
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Request() req: any,
  ): Promise<StudentAttemptResponseDto> {
    return this.studentService.getAttemptResult(req.user.sub, attemptId);
  }
}
