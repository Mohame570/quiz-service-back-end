import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { NotificationService } from '../src/modules/notifications/services/notification.service';

describe('Auth endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationService: NotificationService;

  // Shared mock user — represents a verified student in the database
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: '$2b$12$LXhNGSmcMMwxNMV2rLCLtu50MMKYkSlkAaD2JWfnJe2CqbWlV9vbK',
    name: 'Test User',
    role: 'STUDENT',
    emailVerified: false,
    verificationToken: 'valid-token-123',
    verificationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    studentProfile: null,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    notificationService = app.get<NotificationService>(NotificationService);

    // Mock NotificationService so tests never hit real SMTP or MailHog
    jest.spyOn(notificationService, 'sendVerificationEmail').mockResolvedValue({
      deliveryLogId: 'mock-log-id',
      status: 'SENT' as any,
      templateKey: 'VERIFICATION' as any,
      subject: 'Verify your email',
      html: '<p>Verify</p>',
      text: 'Verify',
      errorMessage: null,
      providerMessageId: 'mock-msg-id',
      deliveredAt: new Date(),
      attemptCount: 1,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // POST /api/auth/register
  // =========================================================================

  it('/api/auth/register (POST) - rejects empty payload', () => {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({})
      .expect(400)
      .expect((res) => {
        expect(res.body.error).toBe('Bad Request');
      });
  });

  it('/api/auth/register (POST) - rejects invalid email', () => {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Test', email: 'not-an-email', password: 'StrongPass123!' })
      .expect(400);
  });

  it('/api/auth/register (POST) - rejects password shorter than 8 characters', () => {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Test', email: 'test@example.com', password: '123' })
      .expect(400);
  });

  it('/api/auth/register (POST) - registers a new user successfully', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null);
    jest.spyOn(prisma.user, 'create').mockResolvedValueOnce(mockUser as any);

    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'StrongPass123!' })
      .expect(201)
      .expect((res) => {
        expect(res.body.user).toBeDefined();
        expect(res.body.user.email).toBe('test@example.com');
        expect(res.body.tokens.accessToken).toBeDefined();
        expect(res.body.user.passwordHash).toBeUndefined();
      });
  });

  it('/api/auth/register (POST) - rejects duplicate email with 409', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as any);

    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'StrongPass123!' })
      .expect(409);
  });

  it('/api/auth/register (POST) - new user always gets STUDENT role', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null);
    jest.spyOn(prisma.user, 'create').mockResolvedValueOnce(mockUser as any);

    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'StrongPass123!' })
      .expect(201)
      .expect((res) => {
        expect(res.body.user.role).toBe('STUDENT');
      });
  });

  // =========================================================================
  // POST /api/auth/login
  // =========================================================================

  it('/api/auth/login (POST) - rejects empty payload', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({})
      .expect(400)
      .expect((res) => {
        expect(res.body.error).toBe('Bad Request');
      });
  });

  it('/api/auth/login (POST) - rejects invalid email format', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'StrongPass123!' })
      .expect(400);
  });

  it('/api/auth/login (POST) - rejects wrong password with 401', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as any);

    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword!' })
      .expect(401);
  });

  it('/api/auth/login (POST) - rejects non-existent email with 401', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null);

    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'StrongPass123!' })
      .expect(401);
  });

  it('/api/auth/login (POST) - rejects inactive account with 401', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
      ...mockUser,
      isActive: false,
    } as any);

    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'StrongPass123!' })
      .expect(401);
  });

  // =========================================================================
  // POST /api/auth/verify-email
  // =========================================================================

  it('/api/auth/verify-email (POST) - rejects empty payload', () => {
    return request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({})
      .expect(400);
  });

  it('/api/auth/verify-email (POST) - rejects invalid token with 401', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(null);

    return request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: 'invalid-token' })
      .expect(401);
  });

  it('/api/auth/verify-email (POST) - rejects expired token with 401', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce({
      ...mockUser,
      verificationTokenExpiresAt: new Date(Date.now() - 1000), // expired
    } as any);

    return request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: 'valid-token-123' })
      .expect(401);
  });

  it('/api/auth/verify-email (POST) - verifies a valid token successfully', async () => {
    jest.spyOn(prisma.user, 'findFirst').mockResolvedValueOnce(mockUser as any);
    jest.spyOn(prisma.user, 'update').mockResolvedValueOnce({
      ...mockUser,
      emailVerified: true,
      verificationToken: null,
      verificationTokenExpiresAt: null,
    } as any);

    return request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: 'valid-token-123' })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
      });
  });

  // =========================================================================
  // POST /api/auth/resend-verification
  // =========================================================================

  it('/api/auth/resend-verification (POST) - rejects empty payload', () => {
    return request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({})
      .expect(400);
  });

  it('/api/auth/resend-verification (POST) - returns 404 for unknown email', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null);

    return request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email: 'nobody@example.com' })
      .expect(404);
  });

  it('/api/auth/resend-verification (POST) - resends successfully for unverified user', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as any);
    jest.spyOn(prisma.user, 'update').mockResolvedValueOnce(mockUser as any);

    return request(app.getHttpServer())
      .post('/api/auth/resend-verification')
      .send({ email: 'test@example.com' })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
      });
  });
});