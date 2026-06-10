/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateQuizDto, CreateQuizStatusEnum } from '../dto/create-quiz.dto';
import { UpdateQuizDto, UpdateQuizStatusEnum } from '../dto/update-quiz.dto';
import { QuizQueryDto, QuizQueryStatusEnum } from '../dto/quiz-query.dto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Quiz, QuizStatus } from '../../../generated/prisma/client';

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Maps case-insensitive string status to Prisma QuizStatus enum
   */
  private mapStatusToEnum(status?: string): QuizStatus | undefined {
    if (!status) return undefined;
    const statusLower = status.toLowerCase();
    if (statusLower === 'draft') return QuizStatus.DRAFT;
    if (statusLower === 'published') return QuizStatus.PUBLISHED;
    return undefined;
  }

  /**
   * Create a new quiz
   */
  async create(createQuizDto: CreateQuizDto): Promise<Quiz> {
    return this.prisma.quiz.create({
      data: {
        title: createQuizDto.title,
        description: createQuizDto.description,
        status: createQuizDto.status
          ? this.mapStatusToEnum(createQuizDto.status)
          : QuizStatus.DRAFT,
        durationMinutes: createQuizDto.durationMinutes,
        passingScore: createQuizDto.passingScore,
        startsAt: createQuizDto.startsAt
          ? new Date(createQuizDto.startsAt)
          : null,
        endsAt: createQuizDto.endsAt ? new Date(createQuizDto.endsAt) : null,
        createdById: createQuizDto.createdById,
      },
    });
  }

  /**
   * Update an existing quiz
   */
  async update(id: string, updateQuizDto: UpdateQuizDto): Promise<Quiz> {
    // Verify quiz exists
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with id ${id} not found`);
    }

    return this.prisma.quiz.update({
      where: { id },
      data: {
        ...(updateQuizDto.title !== undefined && {
          title: updateQuizDto.title,
        }),
        ...(updateQuizDto.description !== undefined && {
          description: updateQuizDto.description,
        }),
        ...(updateQuizDto.status !== undefined && {
          status: this.mapStatusToEnum(updateQuizDto.status),
        }),
        ...(updateQuizDto.durationMinutes !== undefined && {
          durationMinutes: updateQuizDto.durationMinutes,
        }),
        ...(updateQuizDto.passingScore !== undefined && {
          passingScore: updateQuizDto.passingScore,
        }),
        ...(updateQuizDto.startsAt !== undefined && {
          startsAt: updateQuizDto.startsAt
            ? new Date(updateQuizDto.startsAt)
            : null,
        }),
        ...(updateQuizDto.endsAt !== undefined && {
          endsAt: updateQuizDto.endsAt ? new Date(updateQuizDto.endsAt) : null,
        }),
        ...(updateQuizDto.createdById !== undefined && {
          createdById: updateQuizDto.createdById,
        }),
      },
    });
  }

  /**
   * Hard delete a quiz
   */
  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    // Verify quiz exists
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with id ${id} not found`);
    }

    await this.prisma.quiz.delete({
      where: { id },
    });

    return { deleted: true, id };
  }

  /**
   * Get a single quiz by ID
   */
  async findOne(id: string): Promise<Quiz> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with id ${id} not found`);
    }

    return quiz;
  }

  /**
   * Get all quizzes, optionally filtered by status
   */
  async findAll(queryDto: QuizQueryDto): Promise<Quiz[]> {
    const where: any = {};

    if (queryDto.status) {
      where.status = this.mapStatusToEnum(queryDto.status);
    }

    return this.prisma.quiz.findMany({
      where,
    });
  }
}
