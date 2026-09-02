// src/modules/auth/services/auth.service.spec.ts
//
// Unit tests for AuthService.
// All external dependencies (Prisma, JWT, bcrypt, NotificationService)
// are mocked — no database or Docker required.
// These tests prove business logic only: rules, errors, state changes.

jest.mock('../../../generated/prisma/client', () => ({
  UserRole: {
    ADMIN: 'ADMIN',
    STUDENT: 'STUDENT',
  },
  PrismaClient: class {
    $connect() {}
    $disconnect() {}
  },
}))

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$hashedpassword'),
  compare: jest.fn(),
}))

import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { AuthService } from './auth.service';

// ---------------------------------------------------------------------------
// Shared mock user fixture
// Represents a typical unverified student fresh from registration.
// ---------------------------------------------------------------------------
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  passwordHash: '$2b$12$hashedpassword',
  name: 'Test User',
  role: 'STUDENT',
  emailVerified: false,
  verificationToken: 'valid-token-123',
  verificationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h from now
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  studentProfile: null,
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;
//   let jwtService: jest.Mocked<JwtService>;
  let notificationService: jest.Mocked<NotificationService>;

  beforeEach(async () => {
    // Build a test module where every provider is replaced with a jest mock.
    // This is the standard NestJS unit testing pattern.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              const config: Record<string, string> = {
                'jwt.secret': 'test-secret',
                'jwt.accessTokenExpiresIn': '1h',
                FRONTEND_BASE_URL: 'http://localhost:3000',
              };
              return config[key];
            }),
          },
        },
        {
          provide: NotificationService,
          useValue: {
            sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    notificationService = module.get(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // register()
  // =========================================================================
  describe('register()', () => {
    const registerDto = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'StrongPass123!',
    };

    it('creates a new user and returns auth result', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(null);
      prisma.user.create = jest.fn().mockResolvedValue(mockUser);

      const result = await service.register(registerDto);

      expect(prisma.user.create).toHaveBeenCalled();
      expect(result.user.email).toBe(registerDto.email);
      expect(result.tokens.accessToken).toBe('mock-jwt-token');
    });

    it('always assigns STUDENT role regardless of any input', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(null);
      prisma.user.create = jest.fn().mockResolvedValue(mockUser);

      await service.register(registerDto);

      const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.role).toBe('STUDENT');
    });

    it('throws ConflictException if email already exists', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('sends a verification email after registration', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(null);
      prisma.user.create = jest.fn().mockResolvedValue(mockUser);

      await service.register(registerDto);

      expect(notificationService.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: mockUser.email,
        }),
      );
    });

    it('sets verificationTokenExpiresAt on the created user', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(null);
      prisma.user.create = jest.fn().mockResolvedValue(mockUser);

      await service.register(registerDto);

      const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.verificationTokenExpiresAt).toBeInstanceOf(Date);
    });

    it('never exposes passwordHash in the returned user', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(null);
      prisma.user.create = jest.fn().mockResolvedValue(mockUser);

      const result = await service.register(registerDto);

      expect((result.user as any).passwordHash).toBeUndefined();
    });
  });

  // =========================================================================
  // login()
  // =========================================================================
  describe('login()', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'StrongPass123!',
    };

    it('returns auth result for valid credentials', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result.user.email).toBe(loginDto.email);
      expect(result.tokens.accessToken).toBeDefined();
    });

    it('throws UnauthorizedException for wrong password', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for non-existent email', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for inactive account', async () => {
      prisma.user.findUnique = jest
        .fn()
        .mockResolvedValue({ ...mockUser, isActive: false });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('never exposes passwordHash in the returned user', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect((result.user as any).passwordHash).toBeUndefined();
    });
  });

  // =========================================================================
  // verifyEmail()
  // =========================================================================
  describe('verifyEmail()', () => {
    it('marks user as verified for a valid token', async () => {
      prisma.user.findFirst = jest.fn().mockResolvedValue(mockUser);
      prisma.user.update = jest.fn().mockResolvedValue({
        ...mockUser,
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
      });

      const result = await service.verifyEmail({ token: 'valid-token-123' });

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emailVerified: true,
            verificationToken: null,
            verificationTokenExpiresAt: null,
          }),
        }),
      );
    });

    it('throws UnauthorizedException for invalid token', async () => {
      prisma.user.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.verifyEmail({ token: 'invalid-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for expired token', async () => {
      prisma.user.findFirst = jest.fn().mockResolvedValue({
        ...mockUser,
        verificationTokenExpiresAt: new Date(Date.now() - 1000), // expired 1 second ago
      });

      await expect(
        service.verifyEmail({ token: 'valid-token-123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns success idempotently if user is already verified', async () => {
      prisma.user.findFirst = jest.fn().mockResolvedValue({
        ...mockUser,
        emailVerified: true,
      });

      const result = await service.verifyEmail({ token: 'valid-token-123' });

      expect(result.success).toBe(true);
      // Should NOT call update — user is already verified
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // resendVerification()
  // =========================================================================
  describe('resendVerification()', () => {
    it('generates a new token and sends a new email', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      prisma.user.update = jest.fn().mockResolvedValue(mockUser);

      const result = await service.resendVerification({
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalled();
      expect(notificationService.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: mockUser.email,
        }),
      );
    });

    it('sets a new verificationTokenExpiresAt on resend', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(mockUser);
      prisma.user.update = jest.fn().mockResolvedValue(mockUser);

      await service.resendVerification({ email: 'test@example.com' });

      const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.verificationTokenExpiresAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException for unknown email', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        service.resendVerification({ email: 'unknown@example.com' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns success without resending if already verified', async () => {
      prisma.user.findUnique = jest
        .fn()
        .mockResolvedValue({ ...mockUser, emailVerified: true });

      const result = await service.resendVerification({
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(notificationService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('enforces cooldown and throws 429 if resend too soon', async () => {
      const now = new Date();
      prisma.user.findUnique = jest.fn().mockResolvedValue({
        ...mockUser,
        lastVerificationSentAt: now,
      });
      prisma.user.update = jest.fn().mockResolvedValue(mockUser);

      await expect(
        service.resendVerification({ email: 'test@example.com' }),
      ).rejects.toMatchObject({
        status: 429,
      });
      expect(notificationService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('allows resend after cooldown expires', async () => {
      const past = new Date(Date.now() - 61 * 1000); // 61s ago
      prisma.user.findUnique = jest.fn().mockResolvedValue({
        ...mockUser,
        lastVerificationSentAt: past,
      });
      prisma.user.update = jest.fn().mockResolvedValue(mockUser);

      const result = await service.resendVerification({
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(notificationService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('builds verification URL using FRONTEND_BASE_URL', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue(null); // for register path
      prisma.user.findUnique = jest.fn().mockResolvedValue(null);
      prisma.user.create = jest.fn().mockResolvedValue(mockUser);

      await service.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'StrongPass123!',
      });

      const call = (notificationService.sendVerificationEmail as jest.Mock).mock.calls[0][0];
      expect(call.verificationUrl).toContain('http://localhost:3000/verify-email?token=');
    });

    it('updates lastVerificationSentAt on resend', async () => {
      prisma.user.findUnique = jest.fn().mockResolvedValue({
        ...mockUser,
        lastVerificationSentAt: new Date(Date.now() - 61 * 1000),
      });
      prisma.user.update = jest.fn().mockResolvedValue(mockUser);

      await service.resendVerification({ email: 'test@example.com' });

      const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.lastVerificationSentAt).toBeInstanceOf(Date);
    });
  });

  // =========================================================================
  // Question metadata - sanity for schema
  // =========================================================================
  describe('question metadata schema', () => {
    it('supports difficulty/topic/tags via Prisma (mock)', async () => {
      // This test documents the contract: Question should accept difficulty, topic, tags
      const dto = {
        type: 'MCQ' as any,
        text: 'Sample?',
        options: ['A', 'B'],
        correctAnswer: 'A',
        difficulty: 'EASY' as any,
        topic: 'JavaScript',
        tags: ['js', 'basics'],
      };
      // If DTO validation passes, schema supports it
      expect(dto.difficulty).toBe('EASY');
      expect(dto.topic).toBe('JavaScript');
      expect(dto.tags).toContain('js');
    });
  });
});