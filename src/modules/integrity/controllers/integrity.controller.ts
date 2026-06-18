// src/modules/integrity/controllers/integrity.controller.ts
//
// New controller wired against the existing IntegrityService and
// RecordCheatingEventDto (already on main from L7's foundation work).
// This is the missing piece: the solving page had no endpoint to call.
//
// NOTE: Wire @UseGuards(AuthGuard) from L1 once JWT guard is available.

import { Body, Controller, Post } from '@nestjs/common';
import { IsEnum, IsISO8601, IsObject, IsOptional, IsString } from 'class-validator';
import { CheatingEventType } from '../../../generated/prisma/client';
import { IntegrityService } from '../services/integrity.service';
import { RecordCheatingEventDto } from '../dto/record-cheating-event.dto';

// RecordCheatingEventDto is currently a plain interface (no decorators),
// so request bodies aren't validated yet. This class adds validation
// without changing the interface other code already depends on.
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
  constructor(private readonly integrityService: IntegrityService) {}

  /**
   * POST /api/integrity/events
   *
   * Called by the solving page whenever a suspicious browser event fires
   * (tab hidden, window blur, fullscreen exit, copy/paste, etc — see the
   * CheatingEventType enum in prisma/schema.prisma for the full list).
   *
   * Fire this as a non-blocking background request from the client so it
   * never interrupts the student's quiz flow.
   */
  @Post('events')
  async logEvent(@Body() body: RecordCheatingEventBody) {
    return this.integrityService.recordCheatingEvent(body);
  }
}
