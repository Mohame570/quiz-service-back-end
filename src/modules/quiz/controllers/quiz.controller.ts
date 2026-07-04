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
  ForbiddenException,
} from '@nestjs/common';
import { QuizService } from '../services/quiz.service';
import { CreateQuizDto } from '../dto/create-quiz.dto';
import { UpdateQuizDto } from '../dto/update-quiz.dto';
import { QuizQueryDto } from '../dto/quiz-query.dto';
import { QuizListResponseDto } from '../dto/quiz-list-response.dto';
import { AttachQuestionsDto } from '../dto/attach-questions.dto';
import { Quiz, QuizQuestion } from '../../../generated/prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('admin/quizzes')
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
    this.assertAdmin(req);
    return this.quizService.create(createQuizDto);
  }

  /**
   * POST /api/admin/quizzes/:id/copy
   * Duplicate a quiz and all its questions; copy starts as DRAFT
   */
  @Post(':id/copy')
  @HttpCode(HttpStatus.CREATED)
  async copy(@Param('id') id: string, @Request() req: any): Promise<Quiz> {
    this.assertAdmin(req);
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
    @Request() req: any,
  ): Promise<QuizQuestion[]> {
    this.assertAdmin(req);
    return this.quizService.attachQuestions(id, dto);
  }

  /**
   * POST /api/admin/quizzes/:id/publish
   * Publish a quiz after verifying it has at least one question
   */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@Param('id') id: string, @Request() req: any): Promise<Quiz> {
    this.assertAdmin(req);
    return this.quizService.publish(id);
  }

  /**
   * POST /api/admin/quizzes/:id/unpublish
   * Move a quiz back to draft
   */
  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublish(@Param('id') id: string, @Request() req: any): Promise<Quiz> {
    this.assertAdmin(req);
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
    @Request() req: any,
  ): Promise<Quiz> {
    this.assertAdmin(req);
    return this.quizService.update(id, updateQuizDto);
  }

  /**
   * DELETE /api/admin/quizzes/:id
   * Hard delete a quiz
   */
  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<{ deleted: boolean; id: string }> {
    this.assertAdmin(req);
    return this.quizService.delete(id);
  }

  /**
   * GET /api/admin/quizzes/:id
   * Get a single quiz by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any): Promise<Quiz> {
    this.assertAdmin(req);
    return this.quizService.findOne(id);
  }

  /**
   * GET /api/admin/quizzes?status=draft|published
   * Get all quizzes, optionally filtered by status
   */
  @Get()
  async findAll(
    @Query() queryDto: QuizQueryDto,
    @Request() req: any,
  ): Promise<QuizListResponseDto> {
    this.assertAdmin(req);
    return this.quizService.findAll(queryDto);
  }

  private assertAdmin(req: any): void {
    if (req.user?.role !== 'ADMIN') {
      console.log('user role:', req.user?.role);
      throw new ForbiddenException('Admin access required.');
    }
  }
}
