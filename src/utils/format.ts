export function money(minor: number | string | null | undefined, currency = 'INR') {
  const value = Number(minor ?? 0) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value);
}

export function dateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

export function dateOnly(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
}

export function number(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-IN').format(Number(value ?? 0));
}
