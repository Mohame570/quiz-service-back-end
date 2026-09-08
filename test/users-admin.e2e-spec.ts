import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';

import { PrismaService } from '../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { UsersModule } from '../src/modules/users/users.module';
import { UserRole } from '../src/generated/prisma/client';

describe('Users admin endpoints (e2e)', () => {
  let app: INestApplication;

  const mockUsers = [
    {
      id: 'student-1',
      email: 'student1@example.com',
      name: 'Alice Student',
      role: UserRole.STUDENT,
      emailVerified: true,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 'student-2',
      email: 'student2@example.com',
      name: 'Bob Student',
      role: UserRole.STUDENT,
      emailVerified: false,
      isActive: false,
      createdAt: new Date('2026-01-02T00:00:00Z'),
    },
    {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin Boss',
      role: UserRole.ADMIN,
      emailVerified: true,
      isActive: true,
      createdAt: new Date('2026-01-03T00:00:00Z'),
    },
  ];

  const prismaMock = {
    user: {
      findMany: jest.fn().mockImplementation(() => Promise.resolve(mockUsers)),
      count: jest.fn().mockImplementation(() => Promise.resolve(mockUsers.length)),
      findUnique: jest.fn().mockImplementation(({ where: { id } }: any) => {
        const found = mockUsers.find((u) => u.id === id);
        return Promise.resolve(found ? { ...found } : null);
      }),
      update: jest.fn().mockImplementation(({ where: { id }, data }: any) => {
        const found = mockUsers.find((u) => u.id === id);
        return Promise.resolve({ ...found, ...data });
      }),
    },
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true }), UsersModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = {
            sub: 'admin-1',
            email: 'admin@example.com',
            role: 'ADMIN',
          };
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidUnknownValues: false,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/admin/users', () => {
    it('returns paginated list of users', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/users')
        .expect(200);

      expect(res.body).toHaveProperty('users');
      expect(res.body.users.length).toBe(3);
      expect(res.body).toHaveProperty('totalItems', 3);
      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('pageSize', 10);
    });

    it('applies search term, role filter, status filter, and pagination parameters to query', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/users?search=Alice&role=STUDENT&isActive=true&page=2&pageSize=5')
        .expect(200);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { email: { contains: 'Alice', mode: 'insensitive' } },
              { name: { contains: 'Alice', mode: 'insensitive' } },
            ],
            role: UserRole.STUDENT,
            isActive: true,
          }),
          skip: 5,
          take: 5,
        }),
      );
    });
  });

  describe('PATCH /api/admin/users/:id/status', () => {
    it.each([
      { userId: 'student-1', newStatus: false, scenario: 'deactivates an active' },
      { userId: 'student-2', newStatus: true, scenario: 'reactivates an inactive' },
    ])(
      'successfully $scenario student account',
      async ({ userId, newStatus }) => {
        const res = await request(app.getHttpServer())
          .patch(`/api/admin/users/${userId}/status`)
          .send({ isActive: newStatus })
          .expect(200);

        expect(res.body).toHaveProperty('isActive', newStatus);
        expect(prismaMock.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: userId },
            data: { isActive: newStatus },
          }),
        );
      },
    );

    it('blocks admin from deactivating their own account (self-deactivation prevention)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/admin/users/admin-1/status')
        .send({ isActive: false })
        .expect(400);

      expect(res.body.message).toContain('cannot deactivate your own account');
    });

    it('prevents deactivating other admin accounts (only students can be toggled)', async () => {
      // Mock another admin
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'admin-2',
        email: 'otheradmin@example.com',
        name: 'Other Admin',
        role: UserRole.ADMIN,
        emailVerified: true,
        isActive: true,
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .patch('/api/admin/users/admin-2/status')
        .send({ isActive: false })
        .expect(403);

      expect(res.body.message).toContain('Admin accounts cannot be deactivated');
    });

    it('returns 404 when target user is not found', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .patch('/api/admin/users/non-existent-id/status')
        .send({ isActive: false })
        .expect(404);
    });
  });
});
