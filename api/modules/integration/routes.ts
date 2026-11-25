import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { authenticateCustomer, authenticateShop } from '../../middleware/authenticate.js';
import { rateLimit } from '../../middleware/rateLimiter.js';
import { validate } from '../../middleware/validate.js';
import { ok } from '../../utils/ApiResponse.js';
import { ApiError, notFound } from '../../utils/ApiError.js';
import { activateDevice } from '../../services/device.service.js';
import { issueLease, publicKeyPem } from '../../services/licensing.service.js';
import { submitRewardEvent, issueScratchCard, revealScratchCard } from '../../services/reward.service.js';
import { writeAudit } from '../../services/audit.service.js';

export const integrationRoutes = Router();

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

const registerBody = z.object({
  installationId: z.string().uuid(),
  shopName: z.string().trim().min(2).max(200),
  ownerName: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(5).max(40),
  email: z.string().email().optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  countryCode: z.string().length(2).default('IN'),
  gstNumber: z.string().max(40).optional().nullable(),
  appVersion: z.string().max(60).optional().nullable(),
});

/** Desktop shop registration. The registration token is provisioned by an administrator. */
integrationRoutes.post(
  '/shops/register',
  rateLimit({ prefix: 'shop-register', limit: 10, windowSeconds: 3600 }),
  validate({ body: registerBody }),
  async (req, res, next) => {
    try {
      const rawToken = req.header('X-Registration-Token');
      if (!rawToken) throw new ApiError(401, 'REGISTRATION_TOKEN_REQUIRED', 'A registration token is required.');
      const supabase = requireSupabase();
      const tokenHash = hash(rawToken);
      const { data: token, error: tokenError } = await supabase
        .from('shop_registration_tokens')
        .select('id, shop_id, expires_at, used_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      assertNoError({ error: tokenError });
      if (!token) throw new ApiError(401, 'INVALID_REGISTRATION_TOKEN', 'The registration token is invalid.');
      if (token.used_at) throw new ApiError(409, 'TOKEN_ALREADY_USED', 'This registration token has already been used.');
      if (new Date(token.expires_at).getTime() < Date.now()) throw new ApiError(410, 'TOKEN_EXPIRED', 'This registration token has expired.');
      const body = req.input.body as z.infer<typeof registerBody>;
      const { data, error } = await supabase.rpc('register_shop', {
        p_installation_id: body.installationId,
        p_shop_name: body.shopName,
        p_owner_name: body.ownerName,
        p_phone: body.phone,
        p_email: body.email ?? null,
        p_address_line1: body.addressLine1 ?? null,
        p_city: body.city ?? null,
        p_state: body.state ?? null,
        p_postal_code: body.postalCode ?? null,
        p_country_code: body.countryCode,
        p_gst_number: body.gstNumber ?? null,
        p_app_version: body.appVersion ?? null,
      });
      assertNoError({ error });
      const result = data as { shop_id: string; shop_code: string; subscription_id: string; created: boolean };
      const apiKey = randomBytes(32).toString('base64url');
      const { error: keyError } = await supabase.from('shop_api_keys').insert({
        shop_id: result.shop_id,
        key_hash: hash(apiKey),
        label: 'Initial desktop key',
      });
      assertNoError({ error: keyError });
      await supabase.from('shop_registration_tokens').update({ used_at: new Date().toISOString(), shop_id: result.shop_id }).eq('id', token.id);
      await writeAudit({
        actorType: 'SHOP_DEVICE',
        action: result.created ? 'SHOP_REGISTERED' : 'SHOP_REGISTRATION_RETRIED',
        entityType: 'shop',
        entityId: result.shop_id,
        shopId: result.shop_id,
        requestId: req.requestId,
      });
      return ok(res, { ...result, apiKey }, undefined, result.created ? 201 : 200);
    } catch (error) { next(error); }
  },
);

integrationRoutes.get('/integration/licence/public-key', (_req, res, next) => {
  try {
    return ok(res, { format: 'PEM', algorithm: 'Ed25519', publicKey: publicKeyPem() });
  } catch (error) { next(error); }
});

const deviceBody = z.object({
  deviceName: z.string().trim().min(2).max(120),
  publicKey: z.string().trim().min(40).max(8000),
  appVersion: z.string().max(60).optional().nullable(),
});

integrationRoutes.post('/integration/devices/activate', authenticateShop, rateLimit({ prefix: 'device-activate', limit: 20, windowSeconds: 3600 }), validate({ body: deviceBody }), async (req, res, next) => {
  try {
    const body = req.input.body as z.infer<typeof deviceBody>;
    const activated = await activateDevice({ shopId: req.shop!.shopId, ...body });
    const lease = await issueLease(req.shop!.shopId, activated.deviceId);
    await writeAudit({ actorType: 'SHOP_DEVICE', action: 'DEVICE_ACTIVATED', entityType: 'device', entityId: activated.deviceId, shopId: req.shop!.shopId, requestId: req.requestId });
    return ok(res, { ...activated, licence: lease });
  } catch (error) { next(error); }
});

integrationRoutes.get('/integration/licence/check', authenticateShop, validate({ query: z.object({ deviceId: z.string().uuid() }) }), async (req, res, next) => {
  try {
    const { deviceId } = req.input.query as { deviceId: string };
    const lease = await issueLease(req.shop!.shopId, deviceId);
    return ok(res, lease);
  } catch (error) { next(error); }
});

integrationRoutes.post('/integration/licence/heartbeat', authenticateShop, validate({ body: z.object({ deviceId: z.string().uuid(), appVersion: z.string().max(60).optional() }) }), async (req, res, next) => {
  try {
    const { deviceId, appVersion } = req.input.body as { deviceId: string; appVersion?: string };
    const supabase = requireSupabase();
    const now = new Date().toISOString();
    const { error } = await supabase.from('shop_devices').update({ last_seen_at: now }).eq('id', deviceId).eq('shop_id', req.shop!.shopId);
    assertNoError({ error });
    if (appVersion) await supabase.from('shops').update({ app_version: appVersion, last_seen_at: now }).eq('id', req.shop!.shopId);
    const lease = await issueLease(req.shop!.shopId, deviceId);
    return ok(res, lease);
  } catch (error) { next(error); }
});

const rewardEventBody = z.object({
  idempotencyKey: z.string().uuid('Use a UUID event id.'),
  membershipId: z.string().uuid(),
  localSaleId: z.string().trim().min(3).max(200),
  eventType: z.enum(['ELIGIBLE_PURCHASE', 'RETURN', 'REVERSAL']),
  eligibleAmountMinor: z.number().int().positive(),
  currencyCode: z.string().length(3).default('INR'),
  payloadVersion: z.number().int().positive().default(1),
});

integrationRoutes.post('/integration/reward-events', authenticateShop, rateLimit({ prefix: 'reward-event', limit: 120, windowSeconds: 60 }), validate({ body: rewardEventBody }), async (req, res, next) => {
  try {
    if (!req.shop!.rewardsEnabled) throw new ApiError(403, 'REWARDS_DISABLED', 'Customer engagement is disabled for this shop.');
    const result = await submitRewardEvent({
      ...(req.input.body as z.infer<typeof rewardEventBody>),
      shopId: req.shop!.shopId,
      deviceId: req.shop!.keyId,
    });
    return ok(res, result, undefined, result.duplicate ? 200 : 201);
  } catch (error) { next(error); }
});

integrationRoutes.get('/integration/reward-events/:idempotencyKey', authenticateShop, validate({ params: z.object({ idempotencyKey: z.string().uuid() }) }), async (req, res, next) => {
  try {
    const { idempotencyKey } = req.input.params as { idempotencyKey: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('reward_events').select('*').eq('idempotency_key', idempotencyKey).eq('shop_id', req.shop!.shopId).maybeSingle();
    assertNoError({ error });
    if (!data) throw notFound('Reward event not found for this shop.');
    return ok(res, data);
  } catch (error) { next(error); }
});

integrationRoutes.post('/integration/scratchcards/issue', authenticateShop, validate({ body: z.object({ campaignId: z.string().uuid(), membershipId: z.string().uuid(), idempotencyKey: z.string().uuid() }) }), async (req, res, next) => {
  try {
    if (!req.shop!.rewardsEnabled) throw new ApiError(403, 'REWARDS_DISABLED', 'Customer engagement is disabled for this shop.');
    const body = req.input.body as { campaignId: string; membershipId: string; idempotencyKey: string };
    const result = await issueScratchCard({ ...body, shopId: req.shop!.shopId });
    return ok(res, result, undefined, 201);
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------
// Customer-facing integration endpoints (used by the ArthiRewards client)
// ---------------------------------------------------------------------------

integrationRoutes.get('/customer/profile', authenticateCustomer, async (req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('id, display_name, email, phone, dob_reward_opt_in, status, created_at')
      .eq('id', req.customer!.customerId)
      .single();
    assertNoError({ error });
    return ok(res, data);
  } catch (error) { next(error); }
});

integrationRoutes.patch('/customer/profile', authenticateCustomer, validate({ body: z.object({ displayName: z.string().min(2).max(200).optional(), email: z.string().email().optional(), phone: z.string().min(5).max(40).optional(), dateOfBirth: z.string().date().optional(), dobRewardOptIn: z.boolean().optional() }) }), async (req, res, next) => {
  try {
    const body = req.input.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.displayName) patch.display_name = body.displayName;
    if (body.email) patch.email = body.email;
    if (body.phone) patch.phone = body.phone;
    if (body.dateOfBirth) patch.date_of_birth = body.dateOfBirth;
    if (body.dobRewardOptIn !== undefined) patch.dob_reward_opt_in = body.dobRewardOptIn;
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('customer_profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', req.customer!.customerId).select('id, display_name, email, phone, dob_reward_opt_in').single();
    assertNoError({ error });
    return ok(res, data);
  } catch (error) { next(error); }
});

integrationRoutes.get('/customer/memberships', authenticateCustomer, async (req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('customer_shop_memberships')
      .select('id, status, joined_at, shops(shop_code, shop_name)')
      .eq('customer_id', req.customer!.customerId)
      .order('joined_at', { ascending: false });
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

integrationRoutes.get('/customer/rewards/summary', authenticateCustomer, async (req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data: memberships, error } = await supabase.from('customer_shop_memberships').select('id, shops(shop_code, shop_name)').eq('customer_id', req.customer!.customerId);
    assertNoError({ error });
    const membershipIds = (memberships ?? []).map((row) => row.id);
    const [{ data: accounts, error: accountError }, { data: walletEntries, error: walletError }, { data: pointEntries, error: pointsError }] =
      await Promise.all([
        membershipIds.length
          ? supabase.from('wallet_accounts').select('id, membership_id').in('membership_id', membershipIds)
          : Promise.resolve({ data: [], error: null }),
        membershipIds.length
          ? supabase.from('wallet_ledger').select('wallet_account_id, amount_minor_delta')
          : Promise.resolve({ data: [], error: null }),
        membershipIds.length
          ? supabase.from('reward_ledger').select('membership_id, points_delta').in('membership_id', membershipIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
    assertNoError({ error: accountError });
    assertNoError({ error: walletError });
    assertNoError({ error: pointsError });
    const walletIdsByMembership = new Map((accounts ?? []).map((account) => [account.id, account.membership_id]));
    const result = (memberships ?? []).map((membership) => ({
      membershipId: membership.id,
      shop: membership.shops,
      pointsBalance: (pointEntries ?? []).filter((row) => row.membership_id === membership.id)
        .reduce((total, row) => total + Number(row.points_delta ?? 0), 0),
      walletBalanceMinor: (walletEntries ?? []).filter((row) => walletIdsByMembership.get(row.wallet_account_id) === membership.id)
        .reduce((total, row) => total + Number(row.amount_minor_delta ?? 0), 0),
    }));
    return ok(res, result);
  } catch (error) { next(error); }
});

integrationRoutes.get('/customer/rewards/history', authenticateCustomer, async (req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data: memberships, error } = await supabase.from('customer_shop_memberships').select('id').eq('customer_id', req.customer!.customerId);
    assertNoError({ error });
    const ids = (memberships ?? []).map((row) => row.id);
    if (!ids.length) return ok(res, []);
    const { data, error: ledgerError } = await supabase.from('reward_ledger').select('id, entry_type, points_delta, description, created_at').in('membership_id', ids).order('created_at', { ascending: false }).limit(500);
    assertNoError({ error: ledgerError });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

integrationRoutes.post('/customer/redemptions', authenticateCustomer, validate({ body: z.object({ rewardId: z.string().uuid(), idempotencyKey: z.string().uuid() }) }), async (req, res, next) => {
  try {
    const { rewardId, idempotencyKey } = req.input.body as { rewardId: string; idempotencyKey: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('create_redemption', {
      p_customer_id: req.customer!.customerId,
      p_reward_id: rewardId,
      p_idempotency_key: idempotencyKey,
    });
    assertNoError({ error });
    return ok(res, data, undefined, 201);
  } catch (error) { next(error); }
});

integrationRoutes.get('/customer/scratchcards', authenticateCustomer, async (req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data: memberships, error } = await supabase.from('customer_shop_memberships').select('id').eq('customer_id', req.customer!.customerId);
    assertNoError({ error });
    const ids = (memberships ?? []).map((row) => row.id);
    if (!ids.length) return ok(res, []);
    const { data, error: cardError } = await supabase.from('scratch_cards').select('id, status, issued_at, revealed_at, expires_at, scratch_card_campaigns(name)').in('membership_id', ids).order('issued_at', { ascending: false });
    assertNoError({ error: cardError });
    return ok(res, (data ?? []).map((card) => ({ ...card, prize: undefined })));
  } catch (error) { next(error); }
});

integrationRoutes.post('/customer/scratchcards/:id/reveal', authenticateCustomer, validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ idempotencyKey: z.string().uuid() }) }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const { idempotencyKey } = req.input.body as { idempotencyKey: string };
    const result = await revealScratchCard({ cardId: id, customerId: req.customer!.customerId, idempotencyKey });
    return ok(res, result);
  } catch (error) { next(error); }
});
