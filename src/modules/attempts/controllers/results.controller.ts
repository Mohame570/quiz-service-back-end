// src/modules/attempts/controllers/results.controller.ts
// Admin-facing endpoints for viewing scored results.

import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Controller('results')
@UseGuards(JwtAuthGuard)
export class ResultsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/results/:attemptId
   * Student views their own result. Admin can view any result.
   */
  @Get(':attemptId')
  async getResult(
    @Param('attemptId') attemptId: string,
    @Request() req: any,
  ) {
    const result = await this.prisma.result.findUnique({
      where: { attemptId },
    });

    if (!result) {
      return { message: 'Result not yet available.' };
    }

    // Students can only see their own results
    if (req.user.role !== 'ADMIN' && result.studentId !== req.user.sub) {
      throw new ForbiddenException('Access denied.');
    }

    return result;
  }

  /**
   * GET /api/results?quizId=&studentId=
   * Admin only — list results across all students.
   * Optionally filter by quizId or studentId.
   */
  @Get()
  async listResults(
    @Request() req: any,
    @Query('quizId') quizId?: string,
    @Query('studentId') studentId?: string,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }

    const where: any = {};
    if (quizId) where.quizId = quizId;
    if (studentId) where.studentId = studentId;

    return this.prisma.result.findMany({
      where,
      orderBy: { gradedAt: 'desc' },
    });
  }
}
