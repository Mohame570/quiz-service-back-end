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
} from '@nestjs/common';
import { QuizService } from '../services/quiz.service';
import { CreateQuizDto } from '../dto/create-quiz.dto';
import { UpdateQuizDto } from '../dto/update-quiz.dto';
import { QuizQueryDto } from '../dto/quiz-query.dto';
import { Quiz } from '../../../generated/prisma/client';

@Controller('admin/quizzes')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  /**
   * POST /api/admin/quizzes
   * Create a new quiz
   */
  @Post()
  async create(@Body() createQuizDto: CreateQuizDto): Promise<Quiz> {
    return this.quizService.create(createQuizDto);
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
  async findAll(@Query() queryDto: QuizQueryDto): Promise<Quiz[]> {
    return this.quizService.findAll(queryDto);
  }
}
