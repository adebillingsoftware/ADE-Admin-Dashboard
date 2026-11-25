import {
  Activity, Award, BadgeIndianRupee, BarChart3, CalendarClock, CircleDollarSign, ClipboardList,
  CreditCard, FileClock, Gift, LayoutDashboard, MonitorSmartphone, PackageOpen, ScrollText,
  Settings, ShieldCheck, Smartphone, Store, TicketPercent, Users, WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem { label: string; path: string; permission?: string; icon?: LucideIcon }
export interface NavGroup { label: string; items: NavItem[] }

export const NAVIGATION: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Overview', path: '/', icon: LayoutDashboard, permission: 'shops.read' }],
  },
  {
    label: 'Shops',
    items: [
      { label: 'All Shops', path: '/shops', icon: Store, permission: 'shops.read' },
      { label: 'Active', path: '/shops?serviceStatus=ACTIVE', permission: 'shops.read' },
      { label: 'Grace Period', path: '/shops?serviceStatus=GRACE', permission: 'shops.read' },
      { label: 'Suspended', path: '/shops?serviceStatus=SUSPENDED', permission: 'shops.read' },
      { label: 'Cancelled / Archived', path: '/shops?serviceStatus=CANCELLED', permission: 'shops.read' },
    ],
  },
  {
    label: 'Payments',
    items: [
      { label: 'All Payments', path: '/payments', icon: CreditCard, permission: 'payments.read' },
      { label: 'Pending Verification', path: '/payments?status=PENDING', permission: 'payments.read' },
      { label: 'Verified', path: '/payments?status=VERIFIED', permission: 'payments.read' },
      { label: 'Rejected', path: '/payments?status=REJECTED', permission: 'payments.read' },
    ],
  },
  {
    label: 'Subscriptions',
    items: [
      { label: 'Active Subscriptions', path: '/subscriptions?status=ACTIVE', icon: BadgeIndianRupee, permission: 'subscriptions.read' },
      { label: 'Renewals Due', path: '/subscriptions?renewalsDue=7', permission: 'subscriptions.read' },
      { label: 'Grace Period', path: '/subscriptions?status=GRACE', permission: 'subscriptions.read' },
      { label: 'Overdue / Suspended', path: '/subscriptions?status=SUSPENDED', permission: 'subscriptions.read' },
      { label: 'Billing History', path: '/subscriptions/billing', icon: FileClock, permission: 'subscriptions.read' },
    ],
  },
  {
    label: 'Devices',
    items: [
      { label: 'Active Devices', path: '/devices?status=ACTIVE', icon: MonitorSmartphone, permission: 'devices.read' },
      { label: 'Revoked Devices', path: '/devices?status=REVOKED', permission: 'devices.read' },
      { label: 'Device Reset Requests', path: '/devices/reset-requests', icon: Activity, permission: 'devices.read' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'Customer Directory', path: '/customers', icon: Users, permission: 'customers.read' },
      { label: 'Shop Memberships', path: '/customers/memberships', icon: PackageOpen, permission: 'customers.read' },
      { label: 'Customer Support', path: '/customers/support', icon: ClipboardList, permission: 'customers.read' },
    ],
  },
  {
    label: 'Customer Engagement',
    items: [
      { label: 'Reward Programmes', path: '/engagement/programmes', icon: Award, permission: 'engagement.read' },
      { label: 'Points Rules', path: '/engagement/rules?type=POINTS_EARN', permission: 'engagement.read' },
      { label: 'Wallet Rules', path: '/engagement/rules?type=WALLET_CREDIT', permission: 'engagement.read' },
      { label: 'Redemption Rules', path: '/engagement/rules?type=REDEMPTION', permission: 'engagement.read' },
      { label: 'Birthday / DOB Rules', path: '/engagement/rules?type=DOB_REWARD', permission: 'engagement.read' },
      { label: 'Scratch Card Campaigns', path: '/scratchcards/campaigns', icon: TicketPercent, permission: 'scratchcards.read' },
      { label: 'Reward Ledger', path: '/rewards/ledger', icon: ScrollText, permission: 'rewards.read' },
      { label: 'Synchronization Events', path: '/rewards/sync-events', icon: Activity, permission: 'rewards.read' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Monthly Collections', path: '/reports/collections', icon: BarChart3, permission: 'reports.read' },
      { label: 'Outstanding Payments', path: '/reports/outstanding', permission: 'reports.read' },
      { label: 'Subscription Reports', path: '/reports/subscriptions', permission: 'reports.read' },
      { label: 'Shop Registrations', path: '/reports/shops', permission: 'reports.read' },
      { label: 'Customer Reports', path: '/reports/customers', permission: 'reports.read' },
      { label: 'Reward Activity', path: '/reports/rewards', permission: 'reports.read' },
      { label: 'Redemption Activity', path: '/reports/redemptions', permission: 'reports.read' },
      { label: 'Scratch Card Activity', path: '/reports/scratchcards', permission: 'reports.read' },
    ],
  },
  {
    label: 'Audit Logs',
    items: [{ label: 'Audit Logs', path: '/audit', icon: ScrollText, permission: 'audit.read' }],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Monthly Pricing', path: '/settings/pricing', icon: CircleDollarSign, permission: 'settings.read' },
      { label: 'Administrator Accounts', path: '/settings/admins', icon: ShieldCheck, permission: 'admins.manage' },
      { label: 'Roles and Permissions', path: '/settings/roles', permission: 'admins.manage' },
      { label: 'Business Details', path: '/settings/business', permission: 'settings.read' },
      { label: 'Licence Policy', path: '/settings/licence', icon: Smartphone, permission: 'settings.read' },
      { label: 'Customer Engagement Defaults', path: '/settings/engagement', icon: Gift, permission: 'settings.read' },
      { label: 'Security and Retention', path: '/settings/security', permission: 'settings.read' },
      { label: 'Client Integration', path: '/settings/integration', icon: WalletCards, permission: 'settings.read' },
    ],
  },
];
