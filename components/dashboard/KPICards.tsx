import type { ReconciliationSummary } from "./ReconciliationOverview";

interface KPICardsProps {
  summary: ReconciliationSummary;
  aiEscalatedCount?: number;
}

interface KPI {
  label: string;
  value: string | number;
  sub: string;
  color: string;
  bgColor: string;
  ringColor: string;
}

export default function KPICards({ summary, aiEscalatedCount }: KPICardsProps) {
  const total = summary.total;
  const matchRate =
    total > 0 ? Math.round((summary.matched / total) * 100) : 0;

  const kpis: KPI[] = [
    {
      label: "Total Transactions",
      value: total,
      sub: "in current dataset",
      color: "text-slate-900",
      bgColor: "bg-slate-50",
      ringColor: "ring-slate-200",
    },
    {
      label: "Matched",
      value: summary.matched,
      sub: `${total > 0 ? Math.round((summary.matched / total) * 100) : 0}% of total`,
      color: "text-emerald-700",
      bgColor: "bg-emerald-50",
      ringColor: "ring-emerald-200",
    },
    {
      label: "Review",
      value: summary.reviewed,
      sub: "awaiting decision",
      color: "text-amber-700",
      bgColor: "bg-amber-50",
      ringColor: "ring-amber-200",
    },
    {
      label: "Mismatch",
      value: summary.mismatched,
      sub: "amount discrepancy",
      color: "text-rose-700",
      bgColor: "bg-rose-50",
      ringColor: "ring-rose-200",
    },
    {
      label: "Missing",
      value: summary.missing,
      sub: "no settlement found",
      color: "text-orange-700",
      bgColor: "bg-orange-50",
      ringColor: "ring-orange-200",
    },
    {
      label: "Refunded",
      value: summary.refunded,
      sub: "refund lifecycle",
      color: "text-sky-700",
      bgColor: "bg-sky-50",
      ringColor: "ring-sky-200",
    },
    {
      label: "Match Rate",
      value: `${matchRate}%`,
      sub: "auto-resolved",
      color: "text-indigo-700",
      bgColor: "bg-indigo-50",
      ringColor: "ring-indigo-200",
    },
    {
      label: "AI Escalations",
      value: aiEscalatedCount ?? 0,
      sub: "sent to AI judge",
      color: "text-violet-700",
      bgColor: "bg-violet-50",
      ringColor: "ring-violet-200",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className={`rounded-xl border ${kpi.ringColor} ${kpi.bgColor} p-4 transition hover:shadow-sm`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {kpi.label}
          </p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${kpi.color}`}>
            {kpi.value}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">{kpi.sub}</p>
        </div>
      ))}
    </div>
  );
}
