import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Feedback';

export function IntegrationPage() {
  return (
    <>
      <PageHeader title="Client integration" description="Contract guide for ArthiRetail desktop and ArthiRewards customer clients." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Base API"><p className="text-sm text-slate-600">Production and local clients use the single <code>/api/v1</code> Express surface. Bearer tokens are required except for explicitly public health/integration registration endpoints protected by separate keys.</p></Panel>
        <Panel title="ArthiRetail desktop"><ul className="list-disc space-y-2 pl-5 text-sm text-slate-600"><li>Register with a one-time token and receive a shop API key.</li><li>Activate devices through integration endpoints.</li><li>Sign licence issue and heartbeat requests with the desktop private key.</li><li>Submit reward events through the integration event contract.</li></ul></Panel>
        <Panel title="ArthiRewards customer"><ul className="list-disc space-y-2 pl-5 text-sm text-slate-600"><li>Use the configured customer authentication method.</li><li>Read profile, membership, rewards and redemption state.</li><li>Reveal scratch cards only for the authenticated customer and membership.</li><li>Never store Supabase service-role credentials in the client.</li></ul></Panel>
        <Panel title="Security"><ul className="list-disc space-y-2 pl-5 text-sm text-slate-600"><li>Verify licence signatures with the Ed25519 public key.</li><li>Use idempotency keys for registration, events and redemptions.</li><li>Do not invent reward values or commercial prices client-side.</li><li>Keep API keys and refresh tokens outside source control.</li></ul></Panel>
      </div>
    </>
  );
}
