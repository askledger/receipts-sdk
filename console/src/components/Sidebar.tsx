import Link from "next/link";

const NAV = [
  { href: "/", label: "IT / Platform", icon: "▦", group: "Dashboards" },
  { href: "/compliance", label: "Compliance", icon: "✓", group: "Dashboards" },
  { href: "/hr", label: "HR / People", icon: "○", group: "Dashboards" },
  { href: "/legal", label: "Legal", icon: "§", group: "Dashboards" },
  { href: "/finance", label: "Finance / FinOps", icon: "$", group: "Dashboards" },
  { href: "/receipts", label: "Receipts Explorer", icon: "⛓", group: "Data" },
  { href: "/policies", label: "Policies", icon: "≡", group: "Data" },
  { href: "/keys", label: "Keys", icon: "⚿", group: "Data" },
  { href: "/workflows", label: "Workflows", icon: "↔", group: "Data" },
  { href: "/evidence", label: "Evidence Packs", icon: "✦", group: "Data" },
  { href: "/tenants", label: "Tenants", icon: "◫", group: "Admin" },
  { href: "/audit", label: "Audit Log", icon: "✓", group: "Admin" },
  { href: "/settings", label: "Settings", icon: "⚙", group: "Admin" },
];

export function Sidebar() {
  return (
    <aside
      className="w-64 shrink-0 border-r"
      style={{ background: "var(--pl-brand-navy-900)", color: "white", borderColor: "var(--pl-border)" }}
      aria-label="Primary navigation"
    >
      <div className="px-6 py-6 border-b" style={{ borderColor: "rgba(255,255,255,.08)" }}>
        <div className="text-xl font-bold tracking-tight">AskLedger</div>
        <div className="text-xs mt-1 opacity-80">Admin Console · v0.3</div>
      </div>
      <nav className="px-3 py-4">
        {(["Dashboards", "Data", "Admin"] as const).map((group) => (
          <div key={group} className="mb-5">
            <div className="px-3 mb-2 text-[10px] font-semibold tracking-widest uppercase opacity-50">{group}</div>
            <ul className="space-y-1">
              {NAV.filter((n) => n.group === group).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href as never}
                    className="flex items-center gap-3 px-3 py-2 rounded text-sm font-medium hover:bg-white/10 focus:bg-white/10"
                  >
                    <span aria-hidden className="font-mono opacity-70 w-5 text-center">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
