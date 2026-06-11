import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth endpoints', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects an invalid register request', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Bad Request');
  });

  it('rejects an invalid login request', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Bad Request');
  });
});