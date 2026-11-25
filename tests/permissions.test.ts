import { describe, expect, it } from 'vitest';
import { expandRolePermissions, PERMISSIONS, resolvePermissions, ROLE_PERMISSIONS } from '../server/config/permissions.js';

describe('role permissions', () => {
  it('gives SUPER_ADMIN every canonical permission', () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toEqual(Object.values(PERMISSIONS));
  });

  it('expands multiple roles without duplicate permissions', () => {
    const permissions = expandRolePermissions(['BILLING_ADMIN', 'SUPPORT']);
    expect(permissions.has(PERMISSIONS.paymentsVerify)).toBe(true);
    expect(permissions.has(PERMISSIONS.customersWrite)).toBe(true);
  });

  it('returns no permissions for an unknown role', () => {
    expect(expandRolePermissions(['UNKNOWN']).size).toBe(0);
  });

  it('combines role permissions with grants and deny overrides', () => {
    const permissions = resolvePermissions(['SUPER_ADMIN'], [
      { permission: PERMISSIONS.shopsRead, effect: 'DENY' },
      { permission: 'custom.permission', effect: 'GRANT' },
    ]);

    expect(permissions.has(PERMISSIONS.shopsRead)).toBe(false);
    expect(permissions.has('custom.permission')).toBe(true);
  });
});
