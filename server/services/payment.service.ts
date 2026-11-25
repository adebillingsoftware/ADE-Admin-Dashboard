import { requireSupabase, assertNoError } from '../config/supabase.js';
import { ApiError, notFound } from '../utils/ApiError.js';
import { writeAudit } from './audit.service.js';

export interface CreatePaymentInput {
  shopId: string;
  amountMinor: number;
  currencyCode: string;
  method: 'UPI' | 'BANK_TRANSFER' | 'CASH' | 'OTHER';
  transactionReference?: string | null;
  paidAt: string;
  proofStoragePath?: string | null;
  notes?: string | null;
  recordedBy: string;
  requestId: string;
}

export async function createPayment(input: CreatePaymentInput) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('payments')
    .insert({
      shop_id: input.shopId,
      amount_minor: input.amountMinor,
      currency_code: input.currencyCode,
      method: input.method,
      transaction_reference: input.transactionReference ?? null,
      paid_at: input.paidAt,
      proof_storage_path: input.proofStoragePath ?? null,
      notes: input.notes ?? null,
      status: 'PENDING',
      recorded_by: input.recordedBy,
    })
    .select('*')
    .single();
  assertNoError({ error });
  await writeAudit({
    actorUserId: input.recordedBy,
    actorType: 'ADMIN',
    action: 'PAYMENT_RECORDED',
    entityType: 'payment',
    entityId: data.id,
    shopId: input.shopId,
    requestId: input.requestId,
    afterData: { amount_minor: data.amount_minor, method: data.method, status: 'PENDING' },
  });
  return data;
}

/**
 * Verification, allocation and subscription settlement execute inside one
 * PostgreSQL RPC transaction. Duplicate verification is rejected by the RPC.
 */
export async function verifyPayment(
  paymentId: string,
  adminId: string,
  billingPeriodId: string | undefined,
  amountMinor: number | undefined,
  requestId: string,
) {
  const supabase = requireSupabase();
  const { data: payment, error } = await supabase.from('payments').select('id, shop_id, amount_minor, status').eq('id', paymentId).maybeSingle();
  assertNoError({ error });
  if (!payment) throw notFound('Payment not found.');
  if (payment.status === 'VERIFIED') throw new ApiError(409, 'ALREADY_VERIFIED', 'This payment has already been verified.');
  if (payment.status === 'REJECTED') throw new ApiError(409, 'PAYMENT_REJECTED', 'A rejected payment cannot be verified.');

  const { data, error: rpcError } = await supabase.rpc('verify_payment', {
    p_payment_id: paymentId,
    p_billing_period_id: billingPeriodId,
    p_admin_id: adminId,
    p_allocate_amount_minor: amountMinor ?? null,
    p_request_id: requestId,
  });
  assertNoError({ error: rpcError });
  return data as Record<string, unknown>;
}

export async function rejectPayment(paymentId: string, adminId: string, reason: string, requestId: string) {
  if (!reason.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'A rejection reason is required.');
  const supabase = requireSupabase();
  const { data: payment, error: findError } = await supabase
    .from('payments')
    .select('id, shop_id, status')
    .eq('id', paymentId)
    .maybeSingle();
  assertNoError({ error: findError });
  if (!payment) throw notFound('Payment not found.');
  if (payment.status !== 'PENDING') throw new ApiError(409, 'NOT_PENDING', 'Only pending payments can be rejected.');
  const { error } = await supabase
    .from('payments')
    .update({ status: 'REJECTED', verified_by: adminId, verified_at: new Date().toISOString(), rejection_reason: reason })
    .eq('id', paymentId)
    .eq('status', 'PENDING');
  assertNoError({ error });
  await writeAudit({
    actorUserId: adminId,
    actorType: 'ADMIN',
    action: 'PAYMENT_REJECTED',
    entityType: 'payment',
    entityId: paymentId,
    shopId: payment.shop_id,
    reason,
    requestId,
  });
  return { id: paymentId, status: 'REJECTED' };
}
