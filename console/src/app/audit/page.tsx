import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { HashCell } from "@/components/HashCell";

const AUDIT = [
  { at: "2026-06-10 17:31", actor: "rashed.khan@acme-bank", action: "key.rotate", target: "kms-prod-2026Q3", status: "allow", hash: "f01a2b3c4d5e6f70...a9b8c7" },
  { at: "2026-06-10 16:02", actor: "ops.support@askledger", action: "support.impersonate", target: "tenant=acme-bank", status: "flag", hash: "8b1c2d3e4f506172...e1d2c3" },
  { at: "2026-06-10 14:58", actor: "rashed.khan@acme-bank", action: "policy.publish", target: "platform/api/v1/authz@2026.06.04", status: "allow", hash: "13d4e5f607182930...4b5c6d" },
  { at: "2026-06-10 11:41", actor: "audit@acme-bank", action: "evidence.export", target: "evp-2026-q2-cbuae", status: "allow", hash: "ab1c2d3e4f506172...123456" },
] as const;

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          Every admin action is itself a signed receipt on a meta-chain.
        </p>
      </header>

      <Card>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Time</th>
              <th className="py-2 font-medium">Actor</th>
              <th className="py-2 font-medium">Action</th>
              <th className="py-2 font-medium">Target</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">receipt_hash</th>
            </tr>
          </thead>
          <tbody>
            {AUDIT.map((r, i) => (
              <tr key={i} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 font-mono text-xs">{r.at}</td>
                <td className="py-3 text-xs">{r.actor}</td>
                <td className="py-3 font-mono text-xs">{r.action}</td>
                <td className="py-3 text-xs">{r.target}</td>
                <td className="py-3"><StatusBadge status={r.status as "allow" | "flag"} /></td>
                <td className="py-3"><HashCell value={r.hash} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
