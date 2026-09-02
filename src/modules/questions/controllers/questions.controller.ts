import { Controller, Get, Post, Body, HttpCode, HttpStatus, Patch, Param, Delete, Query,UseGuards } from '@nestjs/common';
import { QuestionsService } from '../services/questions.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { UpdateQuestionDto } from '../dto/update-question.dto';
import { RolesGuard } from '../../auth/guards/roles.gaurd';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../../generated/prisma/enums';

@Controller('questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  async findAll(
    @Query('quizId') quizId?: string,
    @Query('unassigned') unassigned?: string,
    @Query('type') type?: string,
  ) {
    if (quizId) {
      return this.questionsService.findByQuiz(quizId, { type: type as any });
    }
    if (unassigned === 'true') {
      return this.questionsService.findAllUnassigned({ type: type as any });
    }
    return this.questionsService.getQuestions({ type: type as any });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.questionsService.getQuestion(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createQuestionDto: CreateQuestionDto) {
    return this.questionsService.createQuestion(createQuestionDto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateQuestionDto: UpdateQuestionDto,
  ) {
    return this.questionsService.updateQuestion(id, updateQuestionDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.questionsService.deleteQuestion(id);
  }
}
