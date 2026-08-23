import MetricCard from "./MetricCard";

export interface ReconciliationSummary {
  total: number;
  matched: number;
  reviewed: number;
  mismatched: number;
  missing: number;
  refunded: number;
}

const SEGMENTS: Array<{
  key: keyof Omit<ReconciliationSummary, "total">;
  label: string;
  bar: string;
}> = [
  { key: "matched", label: "Matched", bar: "bg-emerald-500" },
  { key: "reviewed", label: "Reviewed", bar: "bg-amber-500" },
  { key: "mismatched", label: "Mismatched", bar: "bg-rose-500" },
  { key: "missing", label: "Missing", bar: "bg-orange-400" },
  { key: "refunded", label: "Refunded", bar: "bg-sky-500" },
];

/** KPI grid + stacked decision-distribution bar for one reconciliation run. */
export default function ReconciliationOverview({
  summary,
}: {
  summary: ReconciliationSummary;
}) {
  const pct = (value: number): number =>
    summary.total > 0
      ? Math.round((value / summary.total) * 1000) / 10
      : 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Decision distribution
      </h2>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Total transactions" value={summary.total} />
        {SEGMENTS.map((segment) => (
          <MetricCard
            key={segment.key}
            label={segment.label}
            value={summary[segment.key]}
            hint={`${pct(summary[segment.key])}%`}
          />
        ))}
      </div>

      <div className="mt-5">
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
          {SEGMENTS.map((segment) => {
            const percent = pct(summary[segment.key]);
            return percent > 0 ? (
              <div
                key={segment.key}
                className={segment.bar}
                style={{ width: `${percent}%` }}
                title={`${segment.label}: ${percent}%`}
              />
            ) : null;
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
          {SEGMENTS.map((segment) => (
            <li key={segment.key} className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${segment.bar}`}
                aria-hidden
              />
              <span>{segment.label}</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {summary[segment.key]}
              </span>
              <span className="text-slate-400">({pct(summary[segment.key])}%)</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}