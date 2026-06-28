import { Card } from "@/components/Card";
import { KpiTile } from "@/components/KpiTile";
import { StatusBadge } from "@/components/StatusBadge";

const VIOLATORS = [
  { user: "amir.h@acme-bank.ae", team: "Engineering · Core Payments", events: 4, severity: "high" as const, lastEvent: "2026-06-13 09:12" },
  { user: "yana.r@acme-bank.ae", team: "Marketing", events: 2, severity: "medium" as const, lastEvent: "2026-06-12 16:44" },
  { user: "fahad.s@acme-bank.ae", team: "Engineering · Data Platform", events: 1, severity: "medium" as const, lastEvent: "2026-06-12 11:08" },
];

const TEAMS = [
  { team: "Engineering", users: 142, violations_week: 5, training_completion: 0.87, status: "info" as const, label: "monitor" },
  { team: "Marketing", users: 31, violations_week: 2, training_completion: 0.72, status: "flag" as const, label: "training due" },
  { team: "Sales", users: 58, violations_week: 0, training_completion: 0.94, status: "allow" as const, label: "healthy" },
  { team: "Compliance", users: 12, violations_week: 0, training_completion: 1.0, status: "allow" as const, label: "healthy" },
  { team: "HR", users: 9, violations_week: 0, training_completion: 0.89, status: "allow" as const, label: "healthy" },
];

export default function HRPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">HR dashboard</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          Policy violations by employees, training completion, and which teams need refresher courses.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Policy violations (24h)" value="3" delta="1 high · 2 medium" tone="warn" />
        <KpiTile label="Employees with violations (7d)" value="7" delta="2 repeat" tone="warn" />
        <KpiTile label="Shadow-AI attempts (7d)" value="14" delta="all in Marketing + Eng" tone="warn" />
        <KpiTile label="Teams needing training" value="1" delta="Marketing · 72% complete" tone="warn" />
      </section>

      <Card title="Employees with recent violations" action={<button className="text-sm font-medium" style={{ color: "var(--pl-status-info)" }}>Send training reminder →</button>}>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Employee</th>
              <th className="py-2 font-medium">Team</th>
              <th className="py-2 font-medium">Events (7d)</th>
              <th className="py-2 font-medium">Last event</th>
              <th className="py-2 font-medium">Severity</th>
            </tr>
          </thead>
          <tbody>
            {VIOLATORS.map((v) => (
              <tr key={v.user} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 text-xs font-mono">{v.user}</td>
                <td className="py-3 text-xs">{v.team}</td>
                <td className="py-3">{v.events}</td>
                <td className="py-3 font-mono text-xs">{v.lastEvent}</td>
                <td className="py-3"><StatusBadge status={v.severity === "high" ? "block" : "flag"} label={v.severity} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Team training and policy compliance">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Team</th>
              <th className="py-2 font-medium">Users</th>
              <th className="py-2 font-medium">Violations (7d)</th>
              <th className="py-2 font-medium">Training completion</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {TEAMS.map((t) => (
              <tr key={t.team} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 font-medium">{t.team}</td>
                <td className="py-3">{t.users}</td>
                <td className="py-3">{t.violations_week}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full" style={{ background: "var(--pl-surface-2)" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${t.training_completion * 100}%`, background: t.training_completion >= 0.85 ? "var(--pl-status-allow)" : "var(--pl-status-flag)" }} />
                    </div>
                    <span className="text-xs">{(t.training_completion * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="py-3"><StatusBadge status={t.status} label={t.label} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
