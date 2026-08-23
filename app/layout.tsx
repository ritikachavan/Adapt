/**
 * Shared app shell: brand header with simple built-in next/link navigation
 * (no routing library) and a light fintech theme.
 */
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADAPT — Adaptive AI Finance Controller",
  description:
    "Deterministic reconciliation, a local AI judge for ambiguous cases, human review, and correction memory — fully local.",
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
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight text-indigo-700">
                ADAPT
              </span>
              <span className="hidden text-[11px] font-medium uppercase tracking-wider text-slate-500 sm:inline">
                Adaptive AI Finance Controller
              </span>
            </Link>
            <nav className="ml-auto flex items-center gap-1 text-sm font-medium">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-xs text-slate-400">
          ADAPT · deterministic rules first · local AI only for ambiguity ·
          humans stay in control
        </footer>
      </body>
    </html>
  );
}