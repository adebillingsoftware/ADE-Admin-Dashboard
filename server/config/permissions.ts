/**
 * Canonical permission catalogue. The same identifiers are seeded into
 * public.role_permissions in SQL. Backend checks are authoritative; the
 * frontend only uses these to decide which controls to render.
 */
export const PERMISSIONS = {
  shopsRead: 'shops.read',
  shopsWrite: 'shops.write',
  shopsRegister: 'shops.register',
  paymentsRead: 'payments.read',
  paymentsRecord: 'payments.record',
  paymentsVerify: 'payments.verify',
  paymentsReject: 'payments.reject',
  subscriptionsRead: 'subscriptions.read',
  subscriptionsManage: 'subscriptions.manage',
  devicesRead: 'devices.read',
  devicesManage: 'devices.manage',
  customersRead: 'customers.read',
  customersWrite: 'customers.write',
  engagementRead: 'engagement.read',
  engagementManage: 'engagement.manage',
  rewardsRead: 'rewards.read',
  rewardsAdjust: 'rewards.adjust',
  scratchcardsRead: 'scratchcards.read',
  scratchcardsManage: 'scratchcards.manage',
  reportsRead: 'reports.read',
  auditRead: 'audit.read',
  settingsRead: 'settings.read',
  settingsWrite: 'settings.write',
  adminsManage: 'admins.manage',
  integrationShop: 'integration.shop',
  integrationCustomer: 'integration.customer',
  cronRun: 'cron.run',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: Object.values(PERMISSIONS),
  BILLING_ADMIN: [
    PERMISSIONS.shopsRead, PERMISSIONS.shopsWrite, PERMISSIONS.shopsRegister,
    PERMISSIONS.paymentsRead, PERMISSIONS.paymentsRecord, PERMISSIONS.paymentsVerify, PERMISSIONS.paymentsReject,
    PERMISSIONS.subscriptionsRead, PERMISSIONS.subscriptionsManage,
    PERMISSIONS.devicesRead, PERMISSIONS.devicesManage,
    PERMISSIONS.reportsRead, PERMISSIONS.auditRead, PERMISSIONS.settingsRead,
    PERMISSIONS.integrationShop,
  ],
  SUPPORT: [
    PERMISSIONS.shopsRead, PERMISSIONS.subscriptionsRead, PERMISSIONS.devicesRead,
    PERMISSIONS.customersRead, PERMISSIONS.customersWrite,
    PERMISSIONS.rewardsRead, PERMISSIONS.scratchcardsRead,
    PERMISSIONS.reportsRead, PERMISSIONS.auditRead,
  ],
  ENGAGEMENT_ADMIN: [
    PERMISSIONS.shopsRead, PERMISSIONS.customersRead, PERMISSIONS.customersWrite,
    PERMISSIONS.engagementRead, PERMISSIONS.engagementManage,
    PERMISSIONS.rewardsRead, PERMISSIONS.rewardsAdjust,
    PERMISSIONS.scratchcardsRead, PERMISSIONS.scratchcardsManage,
    PERMISSIONS.reportsRead, PERMISSIONS.auditRead, PERMISSIONS.settingsRead,
  ],
  READ_ONLY: [
    PERMISSIONS.shopsRead, PERMISSIONS.paymentsRead, PERMISSIONS.subscriptionsRead,
    PERMISSIONS.devicesRead, PERMISSIONS.customersRead, PERMISSIONS.engagementRead,
    PERMISSIONS.rewardsRead, PERMISSIONS.scratchcardsRead, PERMISSIONS.reportsRead,
    PERMISSIONS.auditRead, PERMISSIONS.settingsRead,
  ],
};

export function expandRolePermissions(roles: string[]): Set<string> {
  const result = new Set<string>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) result.add(permission);
  }
  return result;
}

export function resolvePermissions(
  roles: string[],
  overrides: { permission: string; effect: 'GRANT' | 'DENY' }[],
): Set<string> {
  const result = expandRolePermissions(roles);
  for (const override of overrides) {
    if (override.effect === 'DENY') result.delete(override.permission);
    else result.add(override.permission);
  }
  return result;
}
