export default function LoginPage() {
  return (
    <div className="min-h-screen grid place-items-center" style={{ background: "var(--pl-surface-0)" }}>
      <div className="w-full max-w-md p-8 rounded-lg border" style={{ background: "var(--pl-surface-1)", borderColor: "var(--pl-border)" }}>
        <h1 className="text-2xl font-bold mb-2">Sign in to Project Ledger</h1>
        <p className="text-sm mb-6" style={{ color: "var(--pl-text-secondary)" }}>
          Enterprise SSO via OIDC. WebAuthn MFA required.
        </p>
        <button className="w-full h-11 rounded font-semibold" style={{ background: "var(--pl-brand-navy-900)", color: "white" }}>
          Continue with SSO
        </button>
        <div className="mt-6 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
          Federated SSO supports Okta · Microsoft Entra ID · Auth0 · Google Workspace.
          On first MFA the platform binds a WebAuthn credential to your device.
        </div>
      </div>
    </div>
  );
}
