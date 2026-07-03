import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { HashCell } from "@/components/HashCell";

const ROWS = Array.from({ length: 25 }, (_, i) => ({
  id: `01J9X8VK${(2300 - i).toString(16).toUpperCase().padStart(4, "0")}`,
  at: new Date(Date.now() - i * 60_000).toISOString().slice(11, 19),
  tenant: "acme-bank",
  evt: i % 3 === 0 ? "agent.tool_call" : "gateway.request",
  vendor: i % 2 === 0 ? "anthropic" : "openai",
  model: i % 2 === 0 ? "claude-sonnet-4-6" : "gpt-5",
  status: (i === 5 || i === 14 ? "block" : "allow") as "allow" | "block",
  height: 12487 - i,
  hash: `${Math.random().toString(16).slice(2, 10).padEnd(8, "0")}d0c0b1d9...${Math.random().toString(16).slice(2, 8)}`,
}));

export default function ReceiptsExplorerPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Receipts Explorer</h1>
          <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
            Search, filter, verify, and export every signed receipt.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-3 py-2 rounded text-sm border" style={{ borderColor: "var(--pl-border)" }}>
            Export selection
          </button>
          <button className="px-3 py-2 rounded text-sm" style={{ background: "var(--pl-brand-navy-900)", color: "white" }}>
            Build evidence pack
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-3 space-y-4">
          <Card title="Filters">
            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pl-text-secondary)" }}>Time range</label>
                <select className="w-full border rounded px-2 py-1.5 bg-transparent" style={{ borderColor: "var(--pl-border)" }}>
                  <option>Last 24 hours</option>
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                  <option>Custom…</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pl-text-secondary)" }}>Status</label>
                <div className="space-y-1.5">
                  {["allow", "block", "flag", "pending"].map((s) => (
                    <label key={s} className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked />
                      <span className="capitalize">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pl-text-secondary)" }}>Vendor</label>
                <select className="w-full border rounded px-2 py-1.5 bg-transparent" style={{ borderColor: "var(--pl-border)" }}>
                  <option>Any</option>
                  <option>anthropic</option>
                  <option>openai</option>
                  <option>bedrock</option>
                  <option>google-generative-ai</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pl-text-secondary)" }}>Classification</label>
                <div className="space-y-1.5">
                  {["public", "internal", "pii_redacted", "pii", "pci", "mnpi"].map((s) => (
                    <label key={s} className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked={["internal", "pii_redacted"].includes(s)} />
                      <span>{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </aside>

        <div className="col-span-9 space-y-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
                    <th className="py-2 font-medium"><input type="checkbox" aria-label="Select all" /></th>
                    <th className="py-2 font-medium">Time</th>
                    <th className="py-2 font-medium">Height</th>
                    <th className="py-2 font-medium">Event</th>
                    <th className="py-2 font-medium">Model</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">receipt_hash</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-black/[0.02]" style={{ borderColor: "var(--pl-border)" }}>
                      <td className="py-2.5"><input type="checkbox" aria-label={`Select receipt ${r.id}`} /></td>
                      <td className="py-2.5 font-mono text-xs">{r.at}</td>
                      <td className="py-2.5">{r.height}</td>
                      <td className="py-2.5">{r.evt}</td>
                      <td className="py-2.5">{r.vendor} · <span className="font-mono text-xs">{r.model}</span></td>
                      <td className="py-2.5"><StatusBadge status={r.status} /></td>
                      <td className="py-2.5"><HashCell value={r.hash} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
              <span>Showing 1–25 of 12,487</span>
              <div className="flex gap-2 items-center">
                <button className="px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Prev</button>
                <span>Page 1 of 500</span>
                <button className="px-2 py-1 border rounded" style={{ borderColor: "var(--pl-border)" }}>Next</button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
