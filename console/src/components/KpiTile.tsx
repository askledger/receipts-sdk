export function KpiTile({
  label,
  value,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  delta?: string;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const toneColor = {
    neutral: "var(--pl-text-secondary)",
    good: "var(--pl-status-allow)",
    bad: "var(--pl-status-block)",
    warn: "var(--pl-status-flag)",
  }[tone];
  return (
    <div
      className="rounded-lg border p-5"
      style={{ background: "var(--pl-surface-1)", borderColor: "var(--pl-border)" }}
    >
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--pl-text-secondary)" }}>
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {delta && (
        <div className="text-xs mt-1 font-medium" style={{ color: toneColor }}>
          {delta}
        </div>
      )}
    </div>
  );
}
