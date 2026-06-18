// src/modules/integrity/controllers/integrity.controller.ts
//
// Updated: server-side ownership validation added.
// - JWT guard authenticates the student
// - attemptId in body is verified to belong to the authenticated student
//   before the event is logged — prevents logging events against other
//   students' attempts

import {
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsISO8601, IsObject, IsOptional, IsString } from 'class-validator';
import { CheatingEventType } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { IntegrityService } from '../services/integrity.service';
import { RecordCheatingEventDto } from '../dto/record-cheating-event.dto';

class RecordCheatingEventBody implements RecordCheatingEventDto {
  @IsString()
  attemptId!: string;

  @IsEnum(CheatingEventType, {
    message: `eventType must be one of: ${Object.values(CheatingEventType).join(', ')}`,
  })
  eventType!: CheatingEventType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: Date;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

@Controller('integrity')
export class IntegrityController {
  constructor(
    private readonly integrityService: IntegrityService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /api/integrity/events
   *
   * Requires a valid JWT. Validates that the attemptId in the body belongs
   * to the authenticated student and is currently IN_PROGRESS before
   * logging the event. Rejects attempts to log events against other
   * students' attempts or already-completed attempts.
   */
  @Post('events')
  @UseGuards(JwtAuthGuard)
  async logEvent(
    @Body() body: RecordCheatingEventBody,
    @Request() req: any,
  ) {
    const studentId: string = req.user.sub;

    // Server-side ownership + status validation
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: body.attemptId },
      select: { studentId: true, status: true },
    });

    if (!attempt) {
      throw new NotFoundException('Attempt not found.');
    }

    if (attempt.studentId !== studentId) {
      throw new ForbiddenException(
        'You can only log integrity events for your own attempts.',
      );
    }

    if (attempt.status !== 'IN_PROGRESS') {
      throw new ForbiddenException(
        'Integrity events can only be logged for active attempts.',
      );
    }

    return this.integrityService.recordCheatingEvent({
      ...body,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    });
  }
}
