import { createHash } from 'node:crypto';
import { requireSupabase, assertNoError } from '../config/supabase.js';
import { ApiError, notFound } from '../utils/ApiError.js';
import { revokeLeases } from './licensing.service.js';
import { writeAudit } from './audit.service.js';

export function fingerprintPublicKey(publicKey: string) {
  return createHash('sha256').update(publicKey.replace(/\s+/g, '').trim()).digest('hex').slice(0, 32);
}

/**
 * Activates or replaces a shop's single active device in one RPC so the
 * partial unique index can never be violated by a race.
 */
export async function activateDevice(input: {
  shopId: string;
  deviceName: string | null;
  publicKey: string;
  appVersion?: string | null;
}) {
  const fingerprint = fingerprintPublicKey(input.publicKey);
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('activate_device', {
    p_shop_id: input.shopId,
    p_device_name: input.deviceName,
    p_public_key: input.publicKey,
    p_key_fingerprint: fingerprint,
    p_app_version: input.appVersion ?? null,
  });
  assertNoError({ error });
  return { deviceId: data as string, fingerprint };
}

export async function revokeDevice(deviceId: string, reason: string, actorUserId: string | null, requestId: string) {
  if (!reason.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'A revocation reason is required.');
  const supabase = requireSupabase();
  const { data: device, error: findError } = await supabase
    .from('shop_devices')
    .select('id, shop_id, status')
    .eq('id', deviceId)
    .maybeSingle();
  assertNoError({ error: findError });
  if (!device) throw notFound('Device not found.');
  const { error } = await supabase
    .from('shop_devices')
    .update({ status: 'REVOKED', revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq('id', deviceId);
  assertNoError({ error });
  await revokeLeases({ deviceId }, reason);
  await writeAudit({
    actorUserId,
    actorType: actorUserId ? 'ADMIN' : 'SYSTEM',
    action: 'DEVICE_REVOKED',
    entityType: 'device',
    entityId: deviceId,
    shopId: device.shop_id,
    reason,
    requestId,
  });
  return { id: deviceId, status: 'REVOKED' };
}

export async function requestDeviceReset(deviceId: string, adminId: string, reason: string, requestId: string) {
  if (!reason.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'A reset reason is required.');
  const supabase = requireSupabase();
  const { data: device, error: findError } = await supabase
    .from('shop_devices')
    .select('id, shop_id')
    .eq('id', deviceId)
    .maybeSingle();
  assertNoError({ error: findError });
  if (!device) throw notFound('Device not found.');
  const { data, error } = await supabase
    .from('device_reset_requests')
    .insert({ device_id: deviceId, shop_id: device.shop_id, requested_by: adminId, reason, status: 'PENDING' })
    .select('*')
    .single();
  assertNoError({ error });
  await revokeDevice(deviceId, `Device reset: ${reason}`, adminId, requestId);
  await supabase.from('device_reset_requests').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', data.id);
  await writeAudit({
    actorUserId: adminId,
    actorType: 'ADMIN',
    action: 'DEVICE_RESET',
    entityType: 'device',
    entityId: deviceId,
    shopId: device.shop_id,
    reason,
    requestId,
  });
  return { requestId: data.id, deviceId, status: 'COMPLETED' };
}
