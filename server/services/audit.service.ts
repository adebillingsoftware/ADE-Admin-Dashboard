import { requireSupabase } from '../config/supabase.js';
import { log } from '../utils/logger.js';

export interface AuditEntry {
  actorUserId?: string | null;
  actorType: 'ADMIN' | 'SYSTEM' | 'SHOP_DEVICE' | 'CUSTOMER';
  action: string;
  entityType: string;
  entityId?: string | null;
  shopId?: string | null;
  customerId?: string | null;
  reason?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  requestId?: string | null;
}

const SECRET_KEY = /(password|token|secret|authorization|api[_-]?key|private[_-]?key|proof_storage_path)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1),
      ]),
    );
  }
  return value;
}

/** Append-only audit write. Never stores credentials or payment secrets. */
export async function writeAudit(entry: AuditEntry) {
  const supabase = requireSupabase();
  const { error } = await supabase.from('audit_logs').insert({
    actor_user_id: entry.actorUserId ?? null,
    actor_type: entry.actorType,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    shop_id: entry.shopId ?? null,
    customer_id: entry.customerId ?? null,
    reason: entry.reason ?? null,
    before_data: entry.beforeData === undefined ? null : redact(entry.beforeData),
    after_data: entry.afterData === undefined ? null : redact(entry.afterData),
    request_id: entry.requestId ?? null,
  });
  if (error) {
    log('error', 'Failed to write audit record', { action: entry.action, message: error.message });
    throw new Error(`Audit write failed: ${error.message}`);
  }
}

export function actorFromAdmin(req: { admin?: { userId: string }; requestId?: string }, entry: Omit<AuditEntry, 'actorUserId' | 'actorType' | 'requestId'>): AuditEntry {
  return {
    ...entry,
    actorUserId: req.admin?.userId ?? null,
    actorType: 'ADMIN',
    requestId: req.requestId ?? null,
  };
}
