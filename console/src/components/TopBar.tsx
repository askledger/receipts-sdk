export function TopBar() {
  return (
    <header
      className="h-14 flex items-center justify-between px-8 border-b"
      style={{ background: "var(--pl-surface-1)", borderColor: "var(--pl-border)" }}
    >
      <div className="flex items-center gap-4 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
        <span>Tenant:</span>
        <select
          className="border rounded px-2 py-1 text-sm bg-transparent"
          style={{ borderColor: "var(--pl-border)" }}
          aria-label="Tenant"
        >
          <option>acme-bank (prod)</option>
          <option>acme-bank (staging)</option>
        </select>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <button className="px-3 py-1.5 rounded border" style={{ borderColor: "var(--pl-border)" }}>
          Verify a receipt
        </button>
        <div className="size-8 rounded-full grid place-items-center text-xs font-semibold" style={{ background: "var(--pl-brand-gold-500)", color: "var(--pl-brand-navy-900)" }} aria-label="Current user">
          RK
        </div>
      </div>
    </header>
  );
}
