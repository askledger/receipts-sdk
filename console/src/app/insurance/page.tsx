import { Card } from "@/components/Card";
import { KpiTile } from "@/components/KpiTile";
import { StatusBadge } from "@/components/StatusBadge";

const BUNDLE = {
  carrier: "Munich Re aiSure",
  period: "2026-05",
  composite_risk: 18,
  band: "A",
  controls_posture: 0.97,
  uptime: 0.9995,
  prior_incidents: 0,
};

const RISK_COMPONENTS = [
  { name: "error_rate",       value: 0.0020, weight: 0.20, band: "good" as const },
  { name: "block_rate",       value: 0.0080, weight: 0.10, band: "good" as const },
  { name: "findings_density", value: 0.25,   weight: 0.15, band: "good" as const },
  { name: "prior_incidents",  value: 0,      weight: 0.15, band: "good" as const },
  { name: "controls_posture", value: 0.03,   weight: 0.15, band: "good" as const },
  { name: "uptime",           value: 0.0005, weight: 0.10, band: "good" as const },
  { name: "regulator_breadth",value: 0.50,   weight: 0.15, band: "watch" as const },
];

const CARRIERS = [
  { id: "MUNICH_RE_AISURE", name: "Munich Re aiSure", status: "allow" as const, label: "ready" },
  { id: "MOSAIC",           name: "Mosaic",           status: "info" as const, label: "draft" },
  { id: "ARMILLA",          name: "Armilla",          status: "info" as const, label: "draft" },
];

export default function InsurancePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Insurance underwriting</h1>
        <p className="text-sm mt-1" style={{ color: "var(--pl-text-secondary)" }}>
          Monthly underwriting bundles in carrier-specific format. Composite risk + premium-input feed for AI liability insurers.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Composite risk" value={String(BUNDLE.composite_risk)} delta={`band ${BUNDLE.band} · lower is better`} tone="good" />
        <KpiTile label="Controls posture" value={`${(BUNDLE.controls_posture * 100).toFixed(0)}%`} delta="64 / 66 mandatory controls" tone="good" />
        <KpiTile label="Uptime" value={`${(BUNDLE.uptime * 100).toFixed(2)}%`} delta="last 30 days" tone="good" />
        <KpiTile label="Prior incidents" value={String(BUNDLE.prior_incidents)} delta="trailing 12 months" tone="good" />
      </section>

      <Card title={`Bundle · ${BUNDLE.carrier} · ${BUNDLE.period}`} action={<button className="text-sm font-medium" style={{ color: "var(--pl-status-info)" }}>Export bundle JSON →</button>}>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Risk component</th>
              <th className="py-2 font-medium">Value</th>
              <th className="py-2 font-medium">Weight</th>
              <th className="py-2 font-medium">Band</th>
            </tr>
          </thead>
          <tbody>
            {RISK_COMPONENTS.map((r) => (
              <tr key={r.name} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 text-xs font-mono">{r.name}</td>
                <td className="py-3 text-xs">{r.value.toFixed(4)}</td>
                <td className="py-3 text-xs">{(r.weight * 100).toFixed(0)}%</td>
                <td className="py-3"><StatusBadge status={r.band === "good" ? "allow" : r.band === "watch" ? "info" : "flag"} label={r.band} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Carrier bundles available">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--pl-text-secondary)" }}>
              <th className="py-2 font-medium">Carrier</th>
              <th className="py-2 font-medium">Format</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {CARRIERS.map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: "var(--pl-border)" }}>
                <td className="py-3 font-medium">{c.name}</td>
                <td className="py-3 text-xs font-mono">{c.id.toLowerCase().replace(/_/g, "-")}-v3.2</td>
                <td className="py-3"><StatusBadge status={c.status} label={c.label} /></td>
                <td className="py-3 text-xs"><span style={{ color: "var(--pl-status-info)", cursor: "pointer" }}>Generate →</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="What carriers consume">
        <ul className="text-sm space-y-2">
          <li><b>Munich Re aiSure</b> · <code>ms_form: aisure-v3.2</code> · <code>ms_class: A..E</code> derived from composite risk band.</li>
          <li><b>Mosaic</b> · <code>msc_layer: primary</code> · <code>msc_attachment_usd: 250000</code> defaults; overridable per policy.</li>
          <li><b>Armilla</b> · <code>arm_tier: A..E</code> · <code>arm_loss_model: freq-sev-2025</code>.</li>
          <li><b>GENERIC</b> · the open-spec common payload for any carrier adopting PL-RFC-future-insurance.</li>
        </ul>
      </Card>
    </div>
  );
}
