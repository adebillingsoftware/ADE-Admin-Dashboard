import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth, RequirePermission } from './routes/guards';
import { Login } from './pages/auth/Login';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import { Overview } from './pages/overview/Overview';
import { ShopsPage } from './pages/shops/ShopsPage';
import { ShopDetails } from './pages/shops/ShopDetails';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { SubscriptionsPage } from './pages/subscriptions/SubscriptionsPage';
import { BillingHistoryPage } from './pages/subscriptions/BillingHistoryPage';
import { DevicesPage } from './pages/devices/DevicesPage';
import { DeviceResets } from './pages/devices/DeviceResets';
import { CustomersPage } from './pages/customers/CustomersPage';
import { CustomerProfile } from './pages/customers/CustomerProfile';
import { MembershipsPage } from './pages/customers/MembershipsPage';
import { SupportTickets } from './pages/customers/SupportTickets';
import { ProgrammesPage } from './pages/engagement/ProgrammesPage';
import { RulesPage } from './pages/engagement/RulesPage';
import { RewardLedgerPage } from './pages/engagement/RewardLedgerPage';
import { SyncEventsPage } from './pages/engagement/SyncEventsPage';
import { ScratchcardsPage } from './pages/scratchcards/ScratchcardsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { AuditPage } from './pages/audit/AuditPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { IntegrationPage } from './pages/settings/IntegrationPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<RequirePermission permission="shops.read" />}><Route index element={<Overview />} /></Route>
          <Route path="/shops" element={<RequirePermission permission="shops.read" />}><Route index element={<ShopsPage />} /></Route>
          <Route path="/shops/:id" element={<RequirePermission permission="shops.read" />}><Route index element={<ShopDetails />} /></Route>
          <Route path="/payments" element={<RequirePermission permission="payments.read" />}><Route index element={<PaymentsPage />} /></Route>
          <Route path="/subscriptions" element={<RequirePermission permission="subscriptions.read" />}><Route index element={<SubscriptionsPage />} /></Route>
          <Route path="/subscriptions/billing" element={<RequirePermission permission="subscriptions.read" />}><Route index element={<BillingHistoryPage />} /></Route>
          <Route path="/devices" element={<RequirePermission permission="devices.read" />}><Route index element={<DevicesPage />} /></Route>
          <Route path="/devices/reset-requests" element={<RequirePermission permission="devices.read" />}><Route index element={<DeviceResets />} /></Route>
          <Route path="/customers" element={<RequirePermission permission="customers.read" />}><Route index element={<CustomersPage />} /></Route>
          <Route path="/customers/:id" element={<RequirePermission permission="customers.read" />}><Route index element={<CustomerProfile />} /></Route>
          <Route path="/customers/memberships" element={<RequirePermission permission="customers.read" />}><Route index element={<MembershipsPage />} /></Route>
          <Route path="/customers/support" element={<RequirePermission permission="customers.read" />}><Route index element={<SupportTickets />} /></Route>
          <Route path="/engagement/programmes" element={<RequirePermission permission="engagement.read" />}><Route index element={<ProgrammesPage />} /></Route>
          <Route path="/engagement/rules" element={<RequirePermission permission="engagement.read" />}><Route index element={<RulesPage />} /></Route>
          <Route path="/rewards/ledger" element={<RequirePermission permission="rewards.read" />}><Route index element={<RewardLedgerPage />} /></Route>
          <Route path="/rewards/sync-events" element={<RequirePermission permission="rewards.read" />}><Route index element={<SyncEventsPage />} /></Route>
          <Route path="/scratchcards/campaigns" element={<RequirePermission permission="scratchcards.read" />}><Route index element={<ScratchcardsPage />} /></Route>
          <Route path="/scratchcards/cards" element={<RequirePermission permission="scratchcards.read" />}><Route index element={<ScratchcardsPage />} /></Route>
          <Route path="/reports/:type" element={<RequirePermission permission="reports.read" />}><Route index element={<ReportsPage />} /></Route>
          <Route path="/audit" element={<RequirePermission permission="audit.read" />}><Route index element={<AuditPage />} /></Route>
          <Route path="/settings/pricing" element={<RequirePermission permission="settings.read" />}><Route index element={<SettingsPage section="pricing" />} /></Route>
          <Route path="/settings/business" element={<RequirePermission permission="settings.read" />}><Route index element={<SettingsPage section="business" />} /></Route>
          <Route path="/settings/licence" element={<RequirePermission permission="settings.read" />}><Route index element={<SettingsPage section="licence" />} /></Route>
          <Route path="/settings/engagement" element={<RequirePermission permission="settings.read" />}><Route index element={<SettingsPage section="engagement" />} /></Route>
          <Route path="/settings/security" element={<RequirePermission permission="settings.read" />}><Route index element={<SettingsPage section="security" />} /></Route>
          <Route path="/settings/admins" element={<RequirePermission permission="admins.manage" />}><Route index element={<SettingsPage section="admins" />} /></Route>
          <Route path="/settings/roles" element={<RequirePermission permission="admins.manage" />}><Route index element={<SettingsPage section="roles" />} /></Route>
          <Route path="/settings/integration" element={<RequirePermission permission="settings.read" />}><Route index element={<IntegrationPage />} /></Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
