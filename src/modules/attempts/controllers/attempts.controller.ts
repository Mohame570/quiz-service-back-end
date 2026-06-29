// src/modules/attempts/controllers/attempts.controller.ts

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { StartAttemptDto } from '../dto/start-attempt.dto';
import { SaveAnswersDto } from '../dto/save-answers.dto';
import { SubmitAttemptDto } from '../dto/submit-attempt.dto';
import {
  AttemptAnswerResponseDto,
  AttemptResponseDto,
  AttemptSummaryDto,
} from '../dto/attempt-response.dto';
import { AttemptsService } from '../services/attempts.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../../auth/guards/email-verified.guard';

// ---------------------------------------------------------------------------
// NOTE: @UseGuards(AuthGuard) and @Request() req.user are stubbed below.
// Wire up the real JWT guard from L1 once auth is available.
// The authenticated student ID is read from req.user.sub per JWT convention.
// ---------------------------------------------------------------------------
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  /**
   * POST /api/attempts
   * Start a new quiz attempt. Records startedAt and sets status IN_PROGRESS.
   */
  @Post()
  start(
    @Body() dto: StartAttemptDto,
    @Request() req: any,
  ): Promise<AttemptResponseDto> {
    const studentId: string = req.user?.sub ;
    return this.attemptsService.start(dto.quizId, studentId);
  }

  /**
   * GET /api/attempts
   * List all attempts for the authenticated student.
   * Optionally filter by ?quizId=<uuid>.
   */
  @Get()
  list(
    @Request() req: any,
    @Query('quizId') quizId?: string,
  ): Promise<AttemptSummaryDto[]> {
    const studentId: string = req.user?.sub ?? 'stub-student-id';
    return this.attemptsService.list(studentId, quizId);
  }

  /**
   * GET /api/attempts/:id
   * Get a single attempt with all saved answers.
   */
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<AttemptResponseDto> {
    const studentId: string = req.user?.sub ?? 'stub-student-id';
    return this.attemptsService.findOne(id, studentId);
  }

  /**
   * PATCH /api/attempts/:id/answers
   * Incrementally save or update answers for an in-progress attempt.
   * Upserts by (attemptId, questionId) — safe to call multiple times.
   */
  @Patch(':id/answers')
  saveAnswers(
    @Param('id') id: string,
    @Body() dto: SaveAnswersDto,
    @Request() req: any,
  ): Promise<AttemptAnswerResponseDto[]> {
    const studentId: string = req.user?.sub ?? 'stub-student-id';
    return this.attemptsService.saveAnswers(id, studentId, dto.answers);
  }

  /**
   * POST /api/attempts/:id/submit
   * Finalise the attempt. Sets status SUBMITTED and records submittedAt.
   * Optionally bulk-saves remaining answers included in the payload.
   * Grading (score/isCorrect) is handled by the scoring service in Sprint 2.
   */
  @Post(':id/submit')
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitAttemptDto,
    @Request() req: any,
  ): Promise<AttemptResponseDto> {
    const studentId: string = req.user?.sub ?? 'stub-student-id';
    return this.attemptsService.submit(id, studentId, dto.answers ?? []);
  }

  /**
   * GET /api/attempts/:id/result
   * Read the graded result of a submitted attempt.
   * score and isCorrect fields are null until Sprint 2 scoring runs.
   */
  @Get(':id/result')
  getResult(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<AttemptResponseDto> {
    const studentId: string = req.user?.sub ?? 'stub-student-id';
    return this.attemptsService.getResult(id, studentId);
  }
}
