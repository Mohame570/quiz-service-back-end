import { Controller, Get, Post, Body, HttpCode, HttpStatus, Patch, Param, Delete, Query } from '@nestjs/common';
import { QuestionsService } from '../services/questions.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { UpdateQuestionDto } from '../dto/update-question.dto';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  async findAll(
    @Query('quizId') quizId?: string,
    @Query('unassigned') unassigned?: string,
    @Query('type') type?: string,
    @Query('difficulty') difficulty?: string,
    @Query('topic') topic?: string,
    @Query('tags') tags?: string,
  ) {
    const filter: any = {};
    if (type) filter.type = type;
    if (difficulty) filter.difficulty = difficulty;
    if (topic) filter.topic = topic;
    if (tags) filter.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (quizId) {
      return this.questionsService.findByQuiz(quizId, filter);
    }
    if (unassigned === 'true') {
      return this.questionsService.findAllUnassigned(filter);
    }
    return this.questionsService.getQuestions(filter);
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
  async update(@Param('id') id: string, @Body() updateQuestionDto: UpdateQuestionDto) {
    return this.questionsService.updateQuestion(id, updateQuestionDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.questionsService.deleteQuestion(id);
  }
}
