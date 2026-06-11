import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Health endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');

    const prisma = app.get<PrismaService>(PrismaService);
    jest.spyOn(prisma, '$connect').mockImplementation(async () => {});
    jest.spyOn(prisma, '$disconnect').mockImplementation(async () => {});

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns the shared health payload', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'Quiz Service Backend',
      environment: 'test',
      stack: 'nestjs-postgres-prisma',
    });
  });
});
