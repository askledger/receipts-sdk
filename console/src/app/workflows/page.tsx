import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";

const FLOWS = [
  { name: "Receipt pipeline · production", states: "captured → signing → timestamping → persisting → notifying → done", rate: "1,283 / hour", failures: 0, status: "allow" as const, label: "healthy" },
  { name: "Approval · key rotation", states: "pending → approved → done", pending: 2, status: "pending" as const, label: "2 in flight" },
  { name: "Approval · evidence pack export", states: "pending → approved → done", pending: 1, status: "pending" as const, label: "1 in flight" },
  { name: "Receipt pipeline · staging", states: "captured → signing → persisting → done", rate: "42 / hour", failures: 0, status: "allow" as const, label: "healthy" },
];

export default function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Workflows</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          End-to-end flows. State transitions are signed and observable.
        </p>
      </header>

      <Card>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Workflow</th>
              <th className="py-2 font-medium">States</th>
              <th className="py-2 font-medium">Throughput</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {FLOWS.map((f) => (
              <tr key={f.name} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3">{f.name}</td>
                <td className="py-3 font-mono text-xs" style={{ color: "var(--pl-text-secondary)" }}>{f.states}</td>
                <td className="py-3">{f.rate ?? `${f.pending} pending`}</td>
                <td className="py-3"><StatusBadge status={f.status} label={f.label} /></td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button className="text-xs px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Details</button>
                    {f.pending != null && <button className="text-xs px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Review</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
