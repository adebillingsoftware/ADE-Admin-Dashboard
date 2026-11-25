type Level = 'info' | 'warn' | 'error';

const SENSITIVE = /(password|token|secret|authorization|api[_-]?key|private[_-]?key)/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE.test(key) ? '[REDACTED]' : redact(val),
      ]),
    );
  }
  return value;
}

export function log(level: Level, message: string, context: Record<string, unknown> = {}) {
  const safeContext = redact(context);
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(safeContext && typeof safeContext === 'object' ? (safeContext as Record<string, unknown>) : {}),
  };
  const output = JSON.stringify(entry);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}
