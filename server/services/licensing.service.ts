import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { env, isLicenceSigningConfigured } from '../config/env.js';
import { requireSupabase, assertNoError } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';

export interface LicencePayload {
  jti: string;
  shop_id: string;
  device_id: string;
  subscription_id: string;
  status: 'ACTIVE';
  issued_at: string;
  expires_at: string;
  key_version: string;
  offline_hours: number;
  policy_version: string;
}

export const MAX_OFFLINE_HOURS = 72;

let cachedPrivateKey: KeyObject | null = null;

function privateKey(): KeyObject {
  if (!isLicenceSigningConfigured) {
    throw new ApiError(503, 'LICENCE_KEY_NOT_CONFIGURED', 'LICENCE_SIGNING_PRIVATE_KEY is not configured.');
  }
  if (!cachedPrivateKey) {
    cachedPrivateKey = createPrivateKey({
      key: Buffer.from(env.LICENCE_SIGNING_PRIVATE_KEY, 'base64'),
      format: 'pem',
      type: 'pkcs8',
    });
    if (cachedPrivateKey.asymmetricKeyType !== 'ed25519') {
      throw new ApiError(500, 'INVALID_LICENCE_KEY', 'LICENCE_SIGNING_PRIVATE_KEY must be an Ed25519 PKCS#8 key.');
    }
  }
  return cachedPrivateKey;
}

export function publicKeyPem() {
  return createPublicKey(privateKey()).export({ type: 'spki', format: 'pem' }).toString();
}

export function canonicalPayload(payload: LicencePayload) {
  const ordered: LicencePayload = {
    jti: payload.jti,
    shop_id: payload.shop_id,
    device_id: payload.device_id,
    subscription_id: payload.subscription_id,
    status: payload.status,
    issued_at: payload.issued_at,
    expires_at: payload.expires_at,
    key_version: payload.key_version,
    offline_hours: payload.offline_hours,
    policy_version: payload.policy_version,
  };
  return JSON.stringify(ordered);
}

export function signLicence(payload: LicencePayload) {
  const body = canonicalPayload(payload);
  const signature = sign(null, Buffer.from(body), privateKey()).toString('base64url');
  const token = `${Buffer.from(body).toString('base64url')}.${signature}`;
  const payloadHash = createHash('sha256').update(body).digest('hex');
  return { token, signature, payloadHash };
}

export function verifyLicenceToken(token: string, pem = publicKeyPem()) {
  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) return false;
  const body = Buffer.from(encodedPayload, 'base64url');
  return verify(null, body, createPublicKey(pem), Buffer.from(encodedSignature, 'base64url'));
}

async function getSetting(key: string, fallback: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new ApiError(500, 'DATABASE_ERROR', error.message);
  if (!data) return fallback;
  const value = data.value as { value?: unknown };
  return String(value.value ?? fallback);
}

export async function issueLease(shopId: string, deviceId: string) {
  const supabase = requireSupabase();
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('id, status')
    .eq('shop_id', shopId)
    .maybeSingle();
  assertNoError({ error: subError });
  if (!subscription || subscription.status !== 'ACTIVE') {
    throw new ApiError(403, 'SUBSCRIPTION_NOT_ACTIVE', 'This shop has no active subscription.');
  }

  const { data: device, error: deviceError } = await supabase
    .from('shop_devices')
    .select('id, status')
    .eq('id', deviceId)
    .eq('shop_id', shopId)
    .maybeSingle();
  assertNoError({ error: deviceError });
  if (!device || device.status !== 'ACTIVE') {
    throw new ApiError(403, 'DEVICE_NOT_ACTIVE', 'This device is not activated.');
  }

  const offlineHours = Math.min(
    MAX_OFFLINE_HOURS,
    Math.max(1, Number(await getSetting('licence.offline_hours', String(MAX_OFFLINE_HOURS)))),
  );
  const policyVersion = await getSetting('licence.policy_version', '1.0');
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + offlineHours * 60 * 60 * 1000);
  const jti = crypto.randomUUID();
  const keyVersion = await getSetting('licence.key_version', '1');
  const payload: LicencePayload = {
    jti,
    shop_id: shopId,
    device_id: deviceId,
    subscription_id: subscription.id,
    status: 'ACTIVE',
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    key_version: keyVersion,
    offline_hours: offlineHours,
    policy_version: policyVersion,
  };
  const signed = signLicence(payload);
  const { error } = await supabase.from('licence_leases').insert({
    shop_id: shopId,
    device_id: deviceId,
    subscription_id: subscription.id,
    jti,
    issued_at: payload.issued_at,
    expires_at: payload.expires_at,
    payload_hash: signed.payloadHash,
    signature_key_id: keyVersion,
  });
  assertNoError({ error });
  return { token: signed.token, expiresAt: payload.expires_at, keyVersion };
}

export async function revokeLeases(scope: { shopId?: string; deviceId?: string; subscriptionId?: string }, reason?: string) {
  const supabase = requireSupabase();
  let query = supabase.from('licence_leases').update({ revoked_at: new Date().toISOString() }).is('revoked_at', null);
  if (scope.shopId) query = query.eq('shop_id', scope.shopId);
  if (scope.deviceId) query = query.eq('device_id', scope.deviceId);
  if (scope.subscriptionId) query = query.eq('subscription_id', scope.subscriptionId);
  const { error } = await query;
  assertNoError({ error });
  void reason;
}
