export function computeExpiresAt(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + durationMinutes * 60_000);
}

export function isExpired(deadline: Date, now: Date = new Date()): boolean {
  return deadline.getTime() <= now.getTime();
}

export function remainingSeconds(deadline: Date, now: Date = new Date()): number {
  const diff = Math.floor((deadline.getTime() - now.getTime()) / 1000);
  return diff > 0 ? diff : 0;
}
