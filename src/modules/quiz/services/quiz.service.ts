import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateQuizDto } from '../dto/create-quiz.dto';
import { UpdateQuizDto } from '../dto/update-quiz.dto';
import { QuizQueryDto } from '../dto/quiz-query.dto';
import { QuizListResponseDto } from '../dto/quiz-list-response.dto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Quiz, QuizStatus, Prisma } from '../../../generated/prisma/client';
import { QuestionsService } from '../../questions/services/questions.service';

@Injectable()
export class QuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionsService: QuestionsService,
  ) {}

  /**
   * Maps case-insensitive string status to Prisma QuizStatus enum
   */
  private mapStatusToEnum(status?: string): QuizStatus | undefined {
    if (!status) return undefined;
    const statusLower = status.toLowerCase();
    if (statusLower === 'draft') return QuizStatus.DRAFT;
    if (statusLower === 'published') return QuizStatus.PUBLISHED;
    if (statusLower === 'closed') return QuizStatus.CLOSED;
    if (statusLower === 'archived') return QuizStatus.ARCHIVED;
    return undefined;
  }

  private isPublishing(status?: string): boolean {
    return this.mapStatusToEnum(status) === QuizStatus.PUBLISHED;
  }

  private parseNullableDate(value?: string | null): Date | null {
    if (value === undefined) {
      return null;
    }

    return value ? new Date(value) : null;
  }

  private isValidDate(value: Date | null): value is Date {
    return value instanceof Date && !Number.isNaN(value.getTime());
  }

  private ensureQuizDateRangeIsValid(
    startsAt: Date | null,
    endsAt: Date | null,
  ): void {
    if (startsAt && !this.isValidDate(startsAt)) {
      throw new BadRequestException('startsAt must be a valid date');
    }

    if (endsAt && !this.isValidDate(endsAt)) {
      throw new BadRequestException('endsAt must be a valid date');
    }

    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
  }

  private async ensureQuizHasQuestions(id: string): Promise<void> {
    const hasQuestions =
      await this.questionsService.validateQuizHasQuestions(id);

    if (!hasQuestions) {
      throw new BadRequestException(
        'Quiz must have at least one question before it can be published',
      );
    }
  }

  /**
   * Create a new quiz
   */
  async create(createQuizDto: CreateQuizDto): Promise<Quiz> {
    if (this.isPublishing(createQuizDto.status)) {
      throw new BadRequestException(
        'A new quiz cannot be created as published because it has no questions yet',
      );
    }

    const startsAt = this.parseNullableDate(createQuizDto.startsAt);
    const endsAt = this.parseNullableDate(createQuizDto.endsAt);
    this.ensureQuizDateRangeIsValid(startsAt, endsAt);

    return this.prisma.quiz.create({
      data: {
        title: createQuizDto.title,
        description: createQuizDto.description,
        status: createQuizDto.status
          ? this.mapStatusToEnum(createQuizDto.status)
          : QuizStatus.DRAFT,
        durationMinutes: createQuizDto.durationMinutes,
        passingScore: createQuizDto.passingScore,
        startsAt,
        endsAt,
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

    if (this.isPublishing(updateQuizDto.status)) {
      await this.ensureQuizHasQuestions(id);
    }

    const startsAt =
      updateQuizDto.startsAt !== undefined
        ? this.parseNullableDate(updateQuizDto.startsAt)
        : quiz.startsAt;
    const endsAt =
      updateQuizDto.endsAt !== undefined
        ? this.parseNullableDate(updateQuizDto.endsAt)
        : quiz.endsAt;

    this.ensureQuizDateRangeIsValid(startsAt, endsAt);

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
          startsAt,
        }),
        ...(updateQuizDto.endsAt !== undefined && {
          endsAt,
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
  async findAll(queryDto: QuizQueryDto): Promise<QuizListResponseDto> {
    const where: Prisma.QuizWhereInput = {};
    if (queryDto.search?.trim()) {
      where.title = { contains: queryDto.search.trim(), mode: 'insensitive' };
    }

    if (queryDto.status) {
      where.status = this.mapStatusToEnum(queryDto.status);
    }

    const page = queryDto.page ?? 1;
    const pageSize = queryDto.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.quiz.findMany({ where, skip, take: pageSize }),
      this.prisma.quiz.count({ where }),
    ]);

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  /**
   * Publish an existing quiz after validating that it has questions.
   */
  async publish(id: string): Promise<Quiz> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with id ${id} not found`);
    }

    await this.ensureQuizHasQuestions(id);

    return this.prisma.quiz.update({
      where: { id },
      data: {
        status: QuizStatus.PUBLISHED,
      },
    });
  }

  /**
   * Unpublish an existing quiz by moving it back to draft.
   */
  async unpublish(id: string): Promise<Quiz> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      throw new NotFoundException(`Quiz with id ${id} not found`);
    }

    return this.prisma.quiz.update({
      where: { id },
      data: {
        status: QuizStatus.DRAFT,
      },
    });
  }

  /**
   * Duplicate an existing quiz with all its questions.
   * The copy always starts as DRAFT with title prefixed "Copy of ".
   */
  async copy(id: string): Promise<Quiz> {
    const original = await this.prisma.quiz.findUnique({
      where: { id },
      include: { questions: true },
    });

    if (!original) {
      throw new NotFoundException(`Quiz with id ${id} not found`);
    }

    return this.prisma.quiz.create({
      data: {
        title: `Copy of ${original.title}`,
        description: original.description,
        status: QuizStatus.DRAFT,
        durationMinutes: original.durationMinutes,
        passingScore: original.passingScore,
        startsAt: original.startsAt,
        endsAt: original.endsAt,
        createdById: original.createdById,
        questions: {
          create: original.questions.map((q) => ({
            type: q.type,
            text: q.text,
            options: q.options,
            correctAnswer: q.correctAnswer,
          })),
        },
      },
      include: { questions: true },
    });
  }
}
