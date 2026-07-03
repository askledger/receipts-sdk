import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { HashCell } from "@/components/HashCell";

export default function PoliciesPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Policies</h1>
          <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
            Rego policy bundles. Every decision is signed; every bundle is content-addressed.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-3 py-2 rounded text-sm border" style={{ borderColor: "var(--pl-border)" }}>Open in editor</button>
          <button className="px-3 py-2 rounded text-sm" style={{ background: "var(--pl-brand-navy-900)", color: "white" }}>Publish new bundle</button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-7 space-y-6">
          <Card title="Active bundles">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
                  <th className="py-2 font-medium">Path</th>
                  <th className="py-2 font-medium">Version</th>
                  <th className="py-2 font-medium">Bundle hash</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { path: "platform/api/v1/authz", version: "2026.06.04", hash: "f01a2b3c4d5e6f70...a9b8c7", status: "allow" as const },
                  { path: "platform/ai/redaction/v2", version: "2026.05.28", hash: "8b1c2d3e4f506172...e1d2c3", status: "allow" as const },
                  { path: "platform/data/classification", version: "2026.06.01", hash: "13d4e5f607182930...4b5c6d", status: "allow" as const },
                  { path: "platform/spending/limits", version: "2026.04.18", hash: "ab1c2d3e4f506172...123456", status: "flag" as const, label: "review due" },
                ].map((p) => (
                  <tr key={p.path} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                    <td className="py-3 font-mono text-xs">{p.path}</td>
                    <td className="py-3 text-xs">{p.version}</td>
                    <td className="py-3"><HashCell value={p.hash} /></td>
                    <td className="py-3"><StatusBadge status={p.status} label={p.label} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Editor · platform/api/v1/authz" action={
            <div className="flex gap-2">
              <button className="text-xs px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Test</button>
              <button className="text-xs px-2 py-1 rounded" style={{ background: "var(--pl-brand-navy-900)", color: "white" }}>Publish</button>
            </div>
          }>
            <pre className="text-xs font-mono p-4 rounded" style={{ background: "var(--pl-surface-2)", color: "var(--pl-text-primary)" }}>
{`package platform.api.v1.authz

default allow := false

# Tenant admin can always read receipts in their tenant.
allow if {
  input.principal.roles[_] == "tenant_admin"
  input.action == "read"
  input.resource.kind == "receipt"
  input.resource.tenant_id == input.principal.tenant_id
}

# Block any cross-tenant access regardless of role.
deny[reason] if {
  input.resource.tenant_id != input.principal.tenant_id
  reason := "cross_tenant_access_denied"
}

# Block PII payloads to non-EU regions when tenant is EU.
deny[reason] if {
  input.principal.tenant_region == "eu"
  input.action == "create"
  input.resource.kind == "receipt"
  input.resource.payload.input_classification == "pii"
  not endswith(input.principal.deployment_region, "eu-")
  reason := "data_residency_violation"
}`}
            </pre>
          </Card>
        </div>

        <div className="col-span-5 space-y-6">
          <Card title="Decision sandbox">
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--pl-text-secondary)" }}>Input (JSON)</label>
                <textarea
                  className="w-full font-mono text-xs p-2 border rounded h-32 bg-transparent"
                  style={{ borderColor: "var(--pl-border)" }}
                  defaultValue={`{
  "principal": {"roles":["tenant_admin"],"tenant_id":"acme-bank","tenant_region":"eu"},
  "action": "read",
  "resource": {"kind":"receipt","tenant_id":"acme-bank"}
}`}
                />
              </div>
              <button className="px-3 py-1.5 rounded text-sm" style={{ background: "var(--pl-brand-navy-900)", color: "white" }}>
                Evaluate
              </button>
              <div className="pt-3 border-t" style={{ borderColor: "var(--pl-border)" }}>
                <div className="text-xs font-medium mb-2" style={{ color: "var(--pl-text-secondary)" }}>Result</div>
                <div className="flex items-center gap-3">
                  <StatusBadge status="allow" /> <span className="text-sm">allowed · no obligations</span>
                </div>
                <div className="text-xs mt-2 font-mono" style={{ color: "var(--pl-text-secondary)" }}>
                  bundle_hash: f01a2b3c4d5e6f70…a9b8c7 · 4.7 ms
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
