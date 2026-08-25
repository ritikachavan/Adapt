import type { ReconciliationSummary } from "./ReconciliationOverview";

interface KPICardsProps {
  summary: ReconciliationSummary;
  aiEscalatedCount?: number;
}

export default function KPICards({ summary, aiEscalatedCount }: KPICardsProps) {
  const total = summary.total;
  const matchRate = total > 0 ? Math.round((summary.matched / total) * 100) : 0;
  const exceptions = summary.reviewed + summary.mismatched + summary.missing;

  const cards = [
    { label: "Records Processed", value: total, accent: "text-slate-900" },
    { label: "Match Rate", value: `${matchRate}%`, accent: matchRate >= 80 ? "text-emerald-700" : matchRate >= 60 ? "text-amber-700" : "text-rose-700" },
    { label: "Exceptions", value: exceptions, accent: "text-amber-700" },
    { label: "AI Escalated", value: aiEscalatedCount ?? 0, accent: "text-violet-700" },
    { label: "Matched", value: summary.matched, accent: "text-emerald-700" },
    { label: "Mismatch", value: summary.mismatched, accent: "text-rose-700" },
    { label: "Missing", value: summary.missing, accent: "text-orange-700" },
    { label: "Refunded", value: summary.refunded, accent: "text-sky-700" },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4 lg:grid-cols-8">
      {cards.map((kpi) => (
        <div key={kpi.label} className="bg-white p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{kpi.label}</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${kpi.accent}`}>{kpi.value}</p>
        </div>
      ))}
    </div>
  );
}
