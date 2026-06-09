import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getHealth(): {
    status: string;
    service: string;
    environment: string;
    stack: string;
  } {
    return {
      status: 'ok',
      service:
        this.configService.get<string>('app.name') ?? 'Quiz Service Backend',
      environment:
        this.configService.get<string>('app.env') ?? 'development',
      stack: 'nestjs-postgres-prisma',
    };
  }
}
