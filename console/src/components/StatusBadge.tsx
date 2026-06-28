import clsx from "clsx";

type Status = "allow" | "block" | "flag" | "pending" | "revoked" | "info";

const STYLES: Record<Status, { bg: string; fg: string; glyph: string }> = {
  allow: { bg: "rgba(27,127,85,.12)", fg: "var(--pl-status-allow)", glyph: "✓" },
  block: { bg: "rgba(163,36,36,.12)", fg: "var(--pl-status-block)", glyph: "✕" },
  flag: { bg: "rgba(185,118,7,.12)", fg: "var(--pl-status-flag)", glyph: "⚐" },
  pending: { bg: "rgba(74,93,138,.12)", fg: "var(--pl-status-pending)", glyph: "⌛" },
  revoked: { bg: "rgba(90,42,140,.12)", fg: "var(--pl-status-revoked)", glyph: "⊘" },
  info: { bg: "rgba(31,94,158,.12)", fg: "var(--pl-status-info)", glyph: "ℹ" },
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const s = STYLES[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2 h-6 rounded-full text-xs font-semibold whitespace-nowrap"
      )}
      style={{ background: s.bg, color: s.fg }}
    >
      <span aria-hidden>{s.glyph}</span>
      <span>{label ?? status}</span>
    </span>
  );
}
