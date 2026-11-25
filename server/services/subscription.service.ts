import { requireSupabase, assertNoError } from '../config/supabase.js';
import { ApiError, notFound } from '../utils/ApiError.js';

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Pure rule helpers — shared by API handlers and unit tests. */
export function calculateGraceEnd(periodEnd: string | Date, graceDays = 7) {
  const end = new Date(periodEnd);
  return new Date(end.getTime() + graceDays * 24 * 60 * 60 * 1000);
}

export function isManualHold(subscription: { suspension_reason?: string | null }) {
  return subscription.suspension_reason === 'MANUAL';
}

export function canAutoSuspend(subscription: { status: string; suspension_reason?: string | null }, now = new Date()) {
  if (subscription.status === 'SUSPENDED') return false;
  if (isManualHold(subscription)) return false;
  return now.getTime() > 0;
}

async function callRpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc(name, args);
  assertNoError({ error });
  return data as T;
}

export async function getSubscription(id: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, shops(id, shop_code, shop_name), subscription_plans(name, monthly_price_minor, currency_code)')
    .eq('id', id)
    .maybeSingle();
  assertNoError({ error });
  if (!data) throw notFound('Subscription not found.');
  return data;
}

export async function getSubscriptionByShop(shopId: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from('subscriptions').select('*').eq('shop_id', shopId).maybeSingle();
  assertNoError({ error });
  if (!data) throw notFound('This shop has no subscription.');
  return data;
}

export async function suspendSubscription(
  subscriptionId: string,
  adminId: string,
  reasonCode: 'MANUAL' | 'OVERDUE' | 'OTHER',
  reason: string,
  requestId: string,
) {
  if (!reason.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'A suspension reason is required.');
  return callRpc('suspend_subscription', {
    p_subscription_id: subscriptionId,
    p_admin_id: adminId,
    p_reason_code: reasonCode,
    p_reason: reason,
    p_request_id: requestId,
  });
}

export async function reactivateSubscription(
  subscriptionId: string,
  adminId: string,
  reason: string,
  requestId: string,
) {
  if (!reason.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'A reactivation reason is required.');
  return callRpc('reactivate_subscription', {
    p_subscription_id: subscriptionId,
    p_admin_id: adminId,
    p_reason: reason,
    p_request_id: requestId,
  });
}

export async function renewSubscription(subscriptionId: string, adminId: string, reason: string, requestId: string) {
  return callRpc('renew_subscription', {
    p_subscription_id: subscriptionId,
    p_admin_id: adminId,
    p_reason: reason || 'Administrator renewal',
    p_request_id: requestId,
  });
}

export async function processLifecycle() {
  return callRpc('process_subscription_lifecycle', {});
}
