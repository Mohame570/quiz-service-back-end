import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateQuizDto, CreateQuizStatusEnum } from '../dto/create-quiz.dto';
import { UpdateQuizDto } from '../dto/update-quiz.dto';
import { QuizStatus } from '@prisma/client';

describe('QuizService', () => {
  let service: QuizService;
  let prismaService: PrismaService;

  const mockQuiz = {
    id: 'test-id-1',
    title: 'Test Quiz',
    description: 'Test Description',
    status: QuizStatus.DRAFT,
    durationMinutes: 30,
    passingScore: 70,
    startsAt: new Date('2026-06-15'),
    endsAt: new Date('2026-06-20'),
    createdById: 'user-1',
    createdAt: new Date('2026-06-10'),
    updatedAt: new Date('2026-06-10'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizService,
        {
          provide: PrismaService,
          useValue: {
            quiz: {
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<QuizService>(QuizService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a quiz with required fields only', async () => {
      const createDto: CreateQuizDto = {
        title: 'New Quiz',
      };

      jest
        .spyOn(prismaService.quiz, 'create')
        .mockResolvedValueOnce(mockQuiz);

      const result = await service.create(createDto);

      expect(prismaService.quiz.create).toHaveBeenCalledWith({
        data: {
          title: 'New Quiz',
          description: undefined,
          status: QuizStatus.DRAFT,
          durationMinutes: undefined,
          passingScore: undefined,
          startsAt: null,
          endsAt: null,
          createdById: undefined,
        },
      });
      expect(result).toEqual(mockQuiz);
    });

    it('should create a quiz with all fields', async () => {
      const createDto: CreateQuizDto = {
        title: 'Full Quiz',
        description: 'Full description',
        status: CreateQuizStatusEnum.PUBLISHED,
        durationMinutes: 45,
        passingScore: 80,
        startsAt: '2026-06-15T00:00:00Z',
        endsAt: '2026-06-20T00:00:00Z',
        createdById: 'user-123',
      };

      jest
        .spyOn(prismaService.quiz, 'create')
        .mockResolvedValueOnce(mockQuiz);

      const result = await service.create(createDto);

      expect(prismaService.quiz.create).toHaveBeenCalledWith({
        data: {
          title: 'Full Quiz',
          description: 'Full description',
          status: QuizStatus.PUBLISHED,
          durationMinutes: 45,
          passingScore: 80,
          startsAt: new Date('2026-06-15T00:00:00Z'),
          endsAt: new Date('2026-06-20T00:00:00Z'),
          createdById: 'user-123',
        },
      });
      expect(result).toEqual(mockQuiz);
    });
  });

  describe('update', () => {
    it('should update a quiz with partial fields', async () => {
      const updateDto: UpdateQuizDto = {
        title: 'Updated Title',
        status: 'published',
      };

      jest
        .spyOn(prismaService.quiz, 'findUnique')
        .mockResolvedValueOnce(mockQuiz);
      jest
        .spyOn(prismaService.quiz, 'update')
        .mockResolvedValueOnce(mockQuiz);

      const result = await service.update('test-id-1', updateDto);

      expect(prismaService.quiz.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-id-1' },
      });
      expect(prismaService.quiz.update).toHaveBeenCalledWith({
        where: { id: 'test-id-1' },
        data: {
          title: 'Updated Title',
          status: QuizStatus.PUBLISHED,
        },
      });
      expect(result).toEqual(mockQuiz);
    });

    it('should throw NotFoundException when quiz does not exist', async () => {
      jest.spyOn(prismaService.quiz, 'findUnique').mockResolvedValueOnce(null);

      const updateDto: UpdateQuizDto = { title: 'Updated' };

      await expect(service.update('non-existent-id', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('should hard delete a quiz', async () => {
      jest
        .spyOn(prismaService.quiz, 'findUnique')
        .mockResolvedValueOnce(mockQuiz);
      jest.spyOn(prismaService.quiz, 'delete').mockResolvedValueOnce(mockQuiz);

      const result = await service.delete('test-id-1');

      expect(prismaService.quiz.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-id-1' },
      });
      expect(prismaService.quiz.delete).toHaveBeenCalledWith({
        where: { id: 'test-id-1' },
      });
      expect(result).toEqual({ deleted: true, id: 'test-id-1' });
    });

    it('should throw NotFoundException when quiz does not exist', async () => {
      jest.spyOn(prismaService.quiz, 'findUnique').mockResolvedValueOnce(null);

      await expect(service.delete('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a quiz by ID', async () => {
      jest
        .spyOn(prismaService.quiz, 'findUnique')
        .mockResolvedValueOnce(mockQuiz);

      const result = await service.findOne('test-id-1');

      expect(prismaService.quiz.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-id-1' },
      });
      expect(result).toEqual(mockQuiz);
    });

    it('should throw NotFoundException when quiz does not exist', async () => {
      jest.spyOn(prismaService.quiz, 'findUnique').mockResolvedValueOnce(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all quizzes without filter', async () => {
      const mockQuizzes = [mockQuiz];
      jest
        .spyOn(prismaService.quiz, 'findMany')
        .mockResolvedValueOnce(mockQuizzes);

      const result = await service.findAll({});

      expect(prismaService.quiz.findMany).toHaveBeenCalledWith({
        where: {},
      });
      expect(result).toEqual(mockQuizzes);
    });

    it('should return only draft quizzes when status filter is draft', async () => {
      const draftQuiz = { ...mockQuiz, status: QuizStatus.DRAFT };
      jest
        .spyOn(prismaService.quiz, 'findMany')
        .mockResolvedValueOnce([draftQuiz]);

      const result = await service.findAll({ status: 'draft' });

      expect(prismaService.quiz.findMany).toHaveBeenCalledWith({
        where: { status: QuizStatus.DRAFT },
      });
      expect(result).toEqual([draftQuiz]);
    });

    it('should return only published quizzes when status filter is published', async () => {
      const publishedQuiz = { ...mockQuiz, status: QuizStatus.PUBLISHED };
      jest
        .spyOn(prismaService.quiz, 'findMany')
        .mockResolvedValueOnce([publishedQuiz]);

      const result = await service.findAll({ status: 'published' });

      expect(prismaService.quiz.findMany).toHaveBeenCalledWith({
        where: { status: QuizStatus.PUBLISHED },
      });
      expect(result).toEqual([publishedQuiz]);
    });

    it('should return empty array when no quizzes match filter', async () => {
      jest.spyOn(prismaService.quiz, 'findMany').mockResolvedValueOnce([]);

      const result = await service.findAll({ status: 'published' });

      expect(result).toEqual([]);
    });
  });
});
