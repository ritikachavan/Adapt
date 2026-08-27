import type { ReconciliationSummary } from "./ReconciliationOverview";

interface HealthScoreProps {
  summary: ReconciliationSummary;
}

export default function HealthScore({ summary }: HealthScoreProps) {
  const total = summary.total;
  if (total === 0) return null;

  const matched = Math.round((summary.matched / total) * 100);
  const review = Math.round((summary.reviewed / total) * 100);
  const mismatch = Math.round((summary.mismatched / total) * 100);
  const missing = Math.round((summary.missing / total) * 100);
  const refunded = Math.round((summary.refunded / total) * 100);

  // Health score: matched is good, everything else reduces it
  const healthScore = matched;

  const getScoreColor = (score: number) => {
    if (score >= 80) return { text: "text-emerald-700", bg: "bg-emerald-500", ring: "ring-emerald-200" };
    if (score >= 60) return { text: "text-amber-700", bg: "bg-amber-500", ring: "ring-amber-200" };
    return { text: "text-rose-700", bg: "bg-rose-500", ring: "ring-rose-200" };
  };

  const scoreColor = getScoreColor(healthScore);

  const segments = [
    { label: "Matched", pct: matched, color: "bg-emerald-500" },
    { label: "Review Required", pct: review, color: "bg-amber-500" },
    { label: "Mismatch", pct: mismatch, color: "bg-rose-500" },
    { label: "Missing", pct: missing, color: "bg-orange-400" },
    { label: "Refunded", pct: refunded, color: "bg-sky-500" },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Reconciliation Health
      </h2>

      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
        {/* Score ring */}
        <div className="relative flex-shrink-0">
          <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120" aria-hidden>
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-slate-100"
            />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
              className={scoreColor.bg}
              style={{
                strokeDasharray: `${2 * Math.PI * 52}`,
                strokeDashoffset: `${2 * Math.PI * 52 * (1 - healthScore / 100)}`,
                transition: "stroke-dashoffset 0.6s ease",
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold tabular-nums ${scoreColor.text}`}>
              {healthScore}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Health
            </span>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="flex-1 space-y-3 w-full">
          {segments.map((seg) => (
            <div key={seg.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{seg.label}</span>
                <span className="font-semibold tabular-nums text-slate-600">
                  {seg.pct}%
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                <div
                  className={`h-2 rounded-full ${seg.color} transition-all duration-500`}
                  style={{ width: `${seg.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
