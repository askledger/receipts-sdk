import type { ReactNode } from "react";

export function Card({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-lg border p-6"
      style={{ background: "var(--pl-surface-1)", borderColor: "var(--pl-border)" }}
    >
      {(title || action) && (
        <header className="flex items-center justify-between mb-4">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
