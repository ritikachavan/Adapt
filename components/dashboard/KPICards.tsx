import type { ReconciliationSummary } from "./ReconciliationOverview";

interface KPICardsProps {
  summary: ReconciliationSummary;
  aiEscalatedCount?: number;
}

export default function KPICards({ summary, aiEscalatedCount }: KPICardsProps) {
  const total = summary.total;
  const matchRate = total > 0 ? Math.round((summary.matched / total) * 100) : 0;
  const exceptions = summary.reviewed + summary.mismatched + summary.missing;

  // Hero cards: Total + Match Rate (larger, more prominent)
  const heroCards = [
    {
      label: "Total Transactions",
      value: total,
      sub: "in current dataset",
      color: "text-slate-900",
      bgColor: "bg-white",
      borderColor: "border-slate-200",
    },
    {
      label: "Match Rate",
      value: `${matchRate}%`,
      sub: `${summary.matched} auto-resolved`,
      color: matchRate >= 80 ? "text-emerald-700" : matchRate >= 60 ? "text-amber-700" : "text-rose-700",
      bgColor: matchRate >= 80 ? "bg-emerald-50" : matchRate >= 60 ? "bg-amber-50" : "bg-rose-50",
      borderColor: matchRate >= 80 ? "border-emerald-200" : matchRate >= 60 ? "border-amber-200" : "border-rose-200",
    },
  ];

  // Secondary cards: decision breakdown
  const secondaryCards = [
    {
      label: "Exceptions",
      value: exceptions,
      sub: "require attention",
      color: "text-amber-700",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-200",
    },
    {
      label: "Matched",
      value: summary.matched,
      sub: "auto-resolved",
      color: "text-emerald-700",
      bgColor: "bg-emerald-50",
      borderColor: "border-emerald-200",
    },
    {
      label: "Mismatch",
      value: summary.mismatched,
      sub: "amount discrepancy",
      color: "text-rose-700",
      bgColor: "bg-rose-50",
      borderColor: "border-rose-200",
    },
    {
      label: "Missing",
      value: summary.missing,
      sub: "no settlement",
      color: "text-orange-700",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
    },
    {
      label: "Refunded",
      value: summary.refunded,
      sub: "refund lifecycle",
      color: "text-sky-700",
      bgColor: "bg-sky-50",
      borderColor: "border-sky-200",
    },
    {
      label: "AI Escalations",
      value: aiEscalatedCount ?? 0,
      sub: "sent to AI judge",
      color: "text-violet-700",
      bgColor: "bg-violet-50",
      borderColor: "border-violet-200",
    },
  ];

  return (
    <div className="space-y-3">
      {/* Hero row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {heroCards.map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-xl border ${kpi.borderColor} ${kpi.bgColor} p-5 transition hover:shadow-sm`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {kpi.label}
            </p>
            <p className={`mt-1 text-3xl font-bold tabular-nums ${kpi.color}`}>
              {kpi.value}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{kpi.sub}</p>
          </div>
        ))}
      </div>
      {/* Secondary row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {secondaryCards.map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-xl border ${kpi.borderColor} ${kpi.bgColor} p-3 transition hover:shadow-sm`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {kpi.label}
            </p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${kpi.color}`}>
              {kpi.value}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">{kpi.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
