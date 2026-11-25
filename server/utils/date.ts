export function utcNow() {
  return new Date().toISOString();
}

export function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function toDateOnly(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

export function isValidDateRange(from?: string, to?: string) {
  if (!from && !to) return true;
  const start = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
  const end = to ? new Date(to).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(start) && Number.isFinite(end) && start <= end;
}
