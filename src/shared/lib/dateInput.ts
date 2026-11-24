/**
 * Date helpers shared by forms and displays. Dates are entered through the
 * native picker (shared/ui/DateField); these convert between JS Dates and
 * the database's date-only columns, and format timestamps for display.
 */

/** Local YYYY-MM-DD for date-only database columns. Uses local date parts,
 * not toISOString() (UTC), which would shift the day between midnight and
 * 5:30 AM IST. */
export function toDateOnly(value: Date | null): string | null {
  if (!value) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** Parses a YYYY-MM-DD date-only column as a local date. */
export function fromDateOnly(value: string | null | undefined): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}
