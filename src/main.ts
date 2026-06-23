import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('app.apiPrefix') ?? 'api';
  const port = configService.get<number>('app.port') ?? 3000;
  const frontendAllowedOrigins = configService.get<string[]>('frontend.allowedOrigins') ?? [];

  app.setGlobalPrefix(apiPrefix);
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
    }),
  );
  app.enableCors({
    origin: frontendAllowedOrigins.length > 0 ? frontendAllowedOrigins : true,
    credentials: true,
  });

  await app.listen(port);
}

void bootstrap();
