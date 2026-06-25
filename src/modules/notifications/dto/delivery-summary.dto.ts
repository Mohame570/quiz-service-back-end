// src/modules/notifications/dto/delivery-summary.dto.ts
//
// Admin-facing aggregated delivery stats.

export class DeliveryStatusCountsDto {
  /** Total delivery logs matching the current filter. */
  total!: number;

  sent!: number;

  failed!: number;

  pending!: number;
}

export class InvitationStatusDto {
  quizId!: string;

  quizTitle?: string | null;

  /** Total quiz-invitation delivery logs for this quiz. */
  totalInvited!: number;

  totalSent!: number;

  totalFailed!: number;

  totalPending!: number;
}

export class DeliverySummaryDto {
  /** Aggregated counts across all template types. */
  overall!: DeliveryStatusCountsDto;

  /** Breakdown per quiz (QUIZ_INVITATION only). */
  invitations!: InvitationStatusDto[];
}
