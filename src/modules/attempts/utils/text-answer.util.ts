export function normalizeShortText(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeShortTextAnswer(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return normalizeShortText(trimmed);
}
