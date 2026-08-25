/**
 * Shared app shell: brand header with simple built-in next/link navigation
 * (no routing library) and a light fintech theme.
 */
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ReconciliationProvider } from "@/lib/reconciliation-context";

export const metadata: Metadata = {
  title: "ADAPT — Financial Reconciliation & Control Intelligence",
  description:
    "Turn reconciliation exceptions into explainable, risk-prioritized investigations. Deterministic rules first, local AI for ambiguity, humans stay in control.",
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/review", label: "Review" },
  { href: "/learning", label: "Learning" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-base font-bold tracking-tight text-slate-900">
                ADAPT
              </span>
              <span className="hidden text-[10px] font-medium uppercase tracking-widest text-slate-400 sm:inline">
                Finance Controller
              </span>
            </Link>
            <nav className="ml-auto flex items-center gap-0.5 text-[13px] font-medium">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded px-2.5 py-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-4">
          <ReconciliationProvider>{children}</ReconciliationProvider>
        </main>
        <footer className="mx-auto max-w-6xl px-4 pb-6 pt-2 text-[11px] text-slate-400">
          ADAPT · deterministic rules first · local AI only for ambiguity ·
          humans stay in control
        </footer>
      </body>
    </html>
  );
}