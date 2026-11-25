import { describe, expect, it } from 'vitest';
import { canonicalPayload, MAX_OFFLINE_HOURS, type LicencePayload } from '../api/services/licensing.service.js';

describe('licence payload', () => {
  it('serializes fields in canonical order', () => {
    const payload: LicencePayload = {
      jti: 'lease-1',
      shop_id: 'shop-1',
      device_id: 'device-1',
      subscription_id: 'subscription-1',
      status: 'ACTIVE',
      issued_at: '2026-11-24T00:00:00.000Z',
      expires_at: '2026-11-24T24:00:00.000Z',
      key_version: '1',
      offline_hours: 24,
      policy_version: '1.0',
    };
    expect(canonicalPayload(payload)).toBe(JSON.stringify(payload));
  });

  it('defines an upper bound for offline leases', () => {
    expect(MAX_OFFLINE_HOURS).toBe(72);
  });
});
