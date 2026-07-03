import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = {
  title: "AskLedger · Admin Console",
  description: "Cryptographic AI Decision Receipts — enterprise admin console",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:bg-brand-navy-900 focus:text-white focus:px-3 focus:py-2 focus:rounded"
        >
          Skip to main content
        </a>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <TopBar />
            <main
              id="main"
              className="flex-1 px-8 py-6"
              style={{ background: "var(--pl-surface-0)" }}
            >
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
