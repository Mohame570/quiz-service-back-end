import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { RecordCheatingEventDto } from '../dto/record-cheating-event.dto';
import {
  CheatingEventSummaryDto,
  SuspiciousAttemptDto,
} from '../dto/suspicious-attempt.dto';

@Injectable()
export class IntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async recordCheatingEvent(input: RecordCheatingEventDto) {
    return this.prisma.cheatingEventLog.create({
      data: {
        attemptId: input.attemptId,
        eventType: input.eventType,
        ...(input.description ? { description: input.description } : {}),
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });
  }

  // -----------------------------------------------------------------------
  // Admin: suspicious-attempts view
  // -----------------------------------------------------------------------

  private async resolveIntegrityThreshold(threshold?: number): Promise<number> {
    if (threshold !== undefined && threshold !== null) {
      return threshold;
    }
    const settings = await this.prisma.organizationSettings.findFirst({
      where: { id: 'default' },
    });
    return settings?.integrityReviewThreshold ?? 3;
  }

  /**
   * Returns attempts that exceed a configurable cheating-event threshold,
   * ordered by event count descending. Each entry includes the most recent
   * events so the admin can triage without additional queries.
   */
  async getSuspiciousAttempts(
    threshold?: number,
    quizId?: string,
  ): Promise<SuspiciousAttemptDto[]> {
    const effectiveThreshold = await this.resolveIntegrityThreshold(threshold);

    // Aggregate cheating events by attemptId
    const grouped = await this.prisma.cheatingEventLog.groupBy({
      by: ['attemptId'],
      _count: { id: true },
      _max: { occurredAt: true },
      where: { attemptId: { not: '' } },
      having: { id: { _count: { gte: effectiveThreshold } } },
      orderBy: { _count: { id: 'desc' } },
    });

    if (!grouped.length) return [];

    const attemptIds = grouped.map((g) => g.attemptId);

    // Fetch attempts + their quiz/student info
    const attempts = await this.prisma.attempt.findMany({
      where: {
        id: { in: attemptIds },
        ...(quizId ? { quizId } : {}),
      },
      select: {
        id: true,
        studentId: true,
        quizId: true,
        quiz: { select: { title: true } },
        student: {
          select: { user: { select: { name: true } } },
        },
      },
    });

    const attemptMap = new Map(
      attempts.map((a) => [a.id, { quizTitle: a.quiz?.title, studentName: a.student?.user?.name }]),
    );

    // Fetch most recent events for each flagged attempt (last 10)
    const recentEvents = await this.prisma.cheatingEventLog.findMany({
      where: { attemptId: { in: attemptIds } },
      orderBy: { occurredAt: 'desc' },
      take: grouped.length * 10,
    });

    const eventsByAttempt = new Map<string, CheatingEventSummaryDto[]>();
    for (const evt of recentEvents) {
      const list = eventsByAttempt.get(evt.attemptId) ?? [];
      list.push({
        id: evt.id,
        eventType: evt.eventType,
        description: evt.description ?? null,
        occurredAt: evt.occurredAt,
      });
      eventsByAttempt.set(evt.attemptId, list);
    }

    return grouped
      .filter((g) => attemptMap.has(g.attemptId))
      .map((g) => ({
        attemptId: g.attemptId,
        studentId: attempts.find((a) => a.id === g.attemptId)?.studentId ?? '',
        studentName: attemptMap.get(g.attemptId)?.studentName ?? null,
        quizId: attempts.find((a) => a.id === g.attemptId)?.quizId ?? '',
        quizTitle: attemptMap.get(g.attemptId)?.quizTitle ?? null,
        eventCount: g._count.id,
        latestEventAt: g._max.occurredAt ?? null,
        events: eventsByAttempt.get(g.attemptId) ?? [],
      }));
  }

  /**
   * Returns all cheating events for a single attempt, ordered by time.
   */
  async getEventsForAttempt(
    attemptId: string,
  ): Promise<CheatingEventSummaryDto[]> {
    const events = await this.prisma.cheatingEventLog.findMany({
      where: { attemptId },
      orderBy: { occurredAt: 'desc' },
    });

    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      description: e.description ?? null,
      occurredAt: e.occurredAt,
    }));
  }
}
