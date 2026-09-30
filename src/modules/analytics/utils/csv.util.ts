// Minimal CSV writer — no external dependency needed for this column set.
// Escapes per RFC 4180: wrap in quotes if the field contains a comma,
// quote, or newline; double any embedded quotes.

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((line) => line.map(escapeCsvField).join(','));
  return lines.join('\r\n') + '\r\n';
}

function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
