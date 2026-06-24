// src/modules/integrity/dto/suspicious-attempt.dto.ts
//
// Admin-facing response shape for the suspicious-attempts view.
// Consumed by the admin integrity monitoring dashboard.
// Keep field names stable; notify analytics owner before renaming.

export class CheatingEventSummaryDto {
  id!: string;
  eventType!: string;
  description?: string | null;
  occurredAt!: Date;
}

export class SuspiciousAttemptDto {
  attemptId!: string;
  studentId!: string;
  studentName?: string | null;
  quizId!: string;
  quizTitle?: string | null;
  eventCount!: number;
  latestEventAt?: Date | null;
  events!: CheatingEventSummaryDto[];
}
