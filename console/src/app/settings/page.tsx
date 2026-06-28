import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          Tenant configuration, security posture, branding.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Security posture">
          <ul className="text-sm space-y-2">
            <li className="flex justify-between"><span>FIPS mode</span><StatusBadge status="allow" label="required-strict" /></li>
            <li className="flex justify-between"><span>HSM provider</span><span className="text-xs">AWS KMS · kms-fips · us-east-1</span></li>
            <li className="flex justify-between"><span>RFC 3161 TSA</span><span className="text-xs">DigiCert TSA</span></li>
            <li className="flex justify-between"><span>Transparency log</span><span className="text-xs">Sigstore Rekor (hosted)</span></li>
            <li className="flex justify-between"><span>Key rotation period</span><span className="text-xs">90 days</span></li>
            <li className="flex justify-between"><span>mTLS service mesh</span><StatusBadge status="allow" label="strict" /></li>
            <li className="flex justify-between"><span>SPIFFE SVID lifetime</span><span className="text-xs">60 min</span></li>
          </ul>
        </Card>

        <Card title="Identity">
          <ul className="text-sm space-y-2">
            <li className="flex justify-between"><span>SSO</span><span className="text-xs">Okta SAML 2.0</span></li>
            <li className="flex justify-between"><span>MFA</span><StatusBadge status="allow" label="WebAuthn required" /></li>
            <li className="flex justify-between"><span>Session</span><span className="text-xs">8h, re-MFA on risk</span></li>
            <li className="flex justify-between"><span>JIT elevated role</span><StatusBadge status="allow" label="≤30 min" /></li>
            <li className="flex justify-between"><span>Support impersonation</span><span className="text-xs">requires customer approval per session</span></li>
          </ul>
        </Card>

        <Card title="Data residency">
          <ul className="text-sm space-y-2">
            <li className="flex justify-between"><span>Primary region</span><span className="text-xs">eu-central-1 (Frankfurt)</span></li>
            <li className="flex justify-between"><span>DR region</span><span className="text-xs">eu-west-1 (Dublin)</span></li>
            <li className="flex justify-between"><span>MENA mirror</span><span className="text-xs">me-central-1 (UAE)</span></li>
            <li className="flex justify-between"><span>Cross-region transfer</span><StatusBadge status="info" label="encrypted, CMK" /></li>
          </ul>
        </Card>

        <Card title="Branding">
          <ul className="text-sm space-y-2">
            <li className="flex justify-between"><span>Logo</span><span className="text-xs">acme-bank.svg · uploaded</span></li>
            <li className="flex justify-between"><span>Primary color</span><span className="text-xs font-mono">#0a1530</span></li>
            <li className="flex justify-between"><span>Accent color</span><span className="text-xs font-mono">#c79b3c</span></li>
            <li className="flex justify-between"><span>Console URL</span><span className="text-xs font-mono">console.acme-bank.github.com/askledger/receipts-sdk</span></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
