import { requireSupabase, assertNoError } from '../config/supabase.js';
import { ApiError, notFound } from '../utils/ApiError.js';
import { writeAudit } from './audit.service.js';

export interface RewardEventInput {
  shopId: string;
  deviceId?: string | null;
  idempotencyKey: string;
  membershipId: string;
  localSaleId: string;
  eventType: 'ELIGIBLE_PURCHASE' | 'RETURN' | 'REVERSAL';
  eligibleAmountMinor: number;
  currencyCode: string;
  payloadVersion: number;
}

/** Rejects reward processing until an approved rule version exists. */
export async function assertApprovedPointsRule(shopId: string) {
  const supabase = requireSupabase();
  const { data: programmes, error: programmeError } = await supabase
    .from('reward_programmes')
    .select('id')
    .eq('shop_id', shopId)
    .eq('status', 'ACTIVE');
  assertNoError({ error: programmeError });
  const programmeIds = (programmes ?? []).map((row) => row.id);
  if (!programmeIds.length) {
    throw new ApiError(409, 'NO_ACTIVE_PROGRAMME', 'This shop has no active reward programme.');
  }
  const { data, error } = await supabase
    .from('reward_rule_versions')
    .select('id, programme_id, version_number, configuration')
    .eq('is_approved', true)
    .eq('rule_type', 'POINTS_EARN')
    .in('programme_id', programmeIds)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  assertNoError({ error });
  if (!data) {
    throw new ApiError(
      409,
      'RULES_NOT_APPROVED',
      'No approved points rule is active for this shop. Reward events are not credited until rules are approved.',
    );
  }
  return data;
}

export async function submitRewardEvent(input: RewardEventInput) {
  const supabase = requireSupabase();
  const existing = await supabase
    .from('reward_events')
    .select('*')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  assertNoError({ error: existing.error });
  if (existing.data) return { ...existing.data, duplicate: true };

  const { data: membership, error: memberError } = await supabase
    .from('customer_shop_memberships')
    .select('id, customer_id, status')
    .eq('id', input.membershipId)
    .eq('shop_id', input.shopId)
    .maybeSingle();
  assertNoError({ error: memberError });
  if (!membership || membership.status !== 'ACTIVE') {
    throw new ApiError(403, 'MEMBERSHIP_INVALID', 'The customer is not an active member of this shop.');
  }

  const rule = await assertApprovedPointsRule(input.shopId);
  const { data: event, error } = await supabase
    .from('reward_events')
    .insert({
      idempotency_key: input.idempotencyKey,
      shop_id: input.shopId,
      device_id: input.deviceId ?? null,
      membership_id: input.membershipId,
      local_sale_id: input.localSaleId,
      event_type: input.eventType,
      eligible_amount_minor: input.eligibleAmountMinor,
      currency_code: input.currencyCode,
      payload_version: input.payloadVersion,
      status: 'RECEIVED',
    })
    .select('*')
    .single();
  if (error?.code === '23505') {
    const retry = await supabase.from('reward_events').select('*').eq('idempotency_key', input.idempotencyKey).single();
    return { ...retry.data, duplicate: true };
  }
  assertNoError({ error });

  const { data: result, error: processError } = await supabase.rpc('process_reward_event', {
    p_event_id: event.id,
    p_rule_version_id: rule.id,
  });
  assertNoError({ error: processError });
  return { ...event, result, duplicate: false };
}

export async function adjustReward(input: {
  membershipId: string;
  adjustmentType: 'POINTS' | 'WALLET';
  amountDelta: number;
  reason: string;
  adminId: string;
  requestId: string;
}) {
  if (!input.amountDelta || !input.reason.trim()) {
    throw new ApiError(400, 'INVALID_ADJUSTMENT', 'A non-zero amount and reason are required.');
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('adjust_reward', {
    p_membership_id: input.membershipId,
    p_adjustment_type: input.adjustmentType,
    p_amount_delta: input.amountDelta,
    p_reason: input.reason,
    p_admin_id: input.adminId,
    p_request_id: input.requestId,
  });
  assertNoError({ error });
  return data as Record<string, unknown>;
}

export async function issueScratchCard(input: {
  campaignId: string;
  membershipId: string;
  shopId: string;
  idempotencyKey: string;
}) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('issue_scratch_card', {
    p_campaign_id: input.campaignId,
    p_membership_id: input.membershipId,
    p_shop_id: input.shopId,
    p_idempotency_key: input.idempotencyKey,
  });
  assertNoError({ error });
  return data as { card_id: string; status: string };
}

export async function revealScratchCard(input: {
  cardId: string;
  customerId: string;
  idempotencyKey: string;
}) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('reveal_scratch_card', {
    p_card_id: input.cardId,
    p_customer_id: input.customerId,
    p_idempotency_key: input.idempotencyKey,
  });
  assertNoError({ error });
  if (!data) throw notFound('Scratch card not found or not owned by this customer.');
  return data as Record<string, unknown>;
}

export async function retrySync(eventId: string, adminId: string, requestId: string) {
  const supabase = requireSupabase();
  const { data: event, error: findError } = await supabase
    .from('reward_events')
    .select('id, status, shop_id')
    .eq('id', eventId)
    .maybeSingle();
  assertNoError({ error: findError });
  if (!event) throw notFound('Synchronization event not found.');
  const { error } = await supabase
    .from('reward_events')
    .update({ status: 'RECEIVED', rejection_code: null })
    .eq('id', eventId);
  assertNoError({ error });
  await writeAudit({
    actorUserId: adminId,
    actorType: 'ADMIN',
    action: 'SYNC_RETRY',
    entityType: 'reward_event',
    entityId: eventId,
    shopId: event.shop_id,
    reason: 'Manual retry requested',
    requestId,
  });
  return { id: eventId, status: 'RECEIVED' };
}
