import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { QuizService } from '../services/quiz.service';
import { CreateQuizDto } from '../dto/create-quiz.dto';
import { UpdateQuizDto } from '../dto/update-quiz.dto';
import { QuizQueryDto } from '../dto/quiz-query.dto';
import { QuizListResponseDto } from '../dto/quiz-list-response.dto';
import { AttachQuestionsDto } from '../dto/attach-questions.dto';
import { Quiz, QuizQuestion } from '../../../generated/prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.gaurd';
import { UserRole } from '../../../generated/prisma/enums';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('admin/quizzes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  /**
   * POST /api/admin/quizzes
   * Create a new quiz
   */
  @Post()
  async create(
    @Body() createQuizDto: CreateQuizDto,
    @Request() req: any,
  ): Promise<Quiz> {
    return this.quizService.create(createQuizDto, req.user.sub);
  }

  /**
   * POST /api/admin/quizzes/:id/copy
   * Duplicate a quiz and all its questions; copy starts as DRAFT
   */
  @Post(':id/copy')
  @HttpCode(HttpStatus.CREATED)
  async copy(@Param('id') id: string): Promise<Quiz> {
    return this.quizService.copy(id);
  }

  /**
   * POST /api/admin/quizzes/:id/questions
   * Attach existing questions (from the question bank) to a draft quiz
   */
  @Post(':id/questions')
  @HttpCode(HttpStatus.CREATED)
  async attachQuestions(
    @Param('id') id: string,
    @Body() dto: AttachQuestionsDto,
  ): Promise<QuizQuestion[]> {
    return this.quizService.attachQuestions(id, dto);
  }

  /**
   * POST /api/admin/quizzes/:id/publish
   * Publish a quiz after verifying it has at least one question
   */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@Param('id') id: string): Promise<Quiz> {
    return this.quizService.publish(id);
  }

  /**
   * POST /api/admin/quizzes/:id/unpublish
   * Move a quiz back to draft
   */
  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublish(@Param('id') id: string): Promise<Quiz> {
    return this.quizService.unpublish(id);
  }

  /**
   * PATCH /api/admin/quizzes/:id
   * Update an existing quiz
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateQuizDto: UpdateQuizDto,
  ): Promise<Quiz> {
    return this.quizService.update(id, updateQuizDto);
  }

  /**
   * DELETE /api/admin/quizzes/:id
   * Hard delete a quiz
   */
  @Delete(':id')
  async delete(
    @Param('id') id: string,
  ): Promise<{ deleted: boolean; id: string }> {
    return this.quizService.delete(id);
  }

  /**
   * GET /api/admin/quizzes/:id
   * Get a single quiz by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Quiz> {
    return this.quizService.findOne(id);
  }

  /**
   * GET /api/admin/quizzes?status=draft|published
   * Get all quizzes, optionally filtered by status
   */
  @Get()
  async findAll(@Query() queryDto: QuizQueryDto): Promise<QuizListResponseDto> {
    return this.quizService.findAll(queryDto);
  }

  @Get(':quizId/invitations')
  async getInvitations(@Param('quizId') quizId: string) {
    return this.quizService.getInvitationsForQuiz(quizId);
  }

  @Get(':quizId/reminders/preview')
  async getRemindPreview(@Param('quizId') quizId: string) {
    return this.quizService.getRemindPreview(quizId);
  }

  @Post(':quizId/reminders')
  async sendReminders(@Param('quizId') quizId: string) {
    return this.quizService.sendQuizReminders(quizId);
  }
}
