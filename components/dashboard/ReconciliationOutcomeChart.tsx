import type { ReconciliationSummary } from "./ReconciliationOverview";

interface Props {
  summary: ReconciliationSummary;
}

const CATEGORIES: Array<{
  key: "MATCHED" | "REVIEW" | "MISMATCH" | "MISSING" | "REFUNDED";
  label: string;
  color: string;
}> = [
  { key: "MATCHED", label: "Matched", color: "bg-emerald-500" },
  { key: "REVIEW", label: "Review Required", color: "bg-amber-500" },
  { key: "REFUNDED", label: "Refunded", color: "bg-sky-500" },
  { key: "MISMATCH", label: "Mismatch", color: "bg-rose-500" },
  { key: "MISSING", label: "Missing", color: "bg-orange-400" },
];

const CHART_HEIGHT_PX = 140;

/**
 * Vertical bar chart showing reconciliation outcome distribution.
 * Pure presentational — derives all values from the existing summary prop.
 */
export default function ReconciliationOutcomeChart({ summary }: Props) {
  const total = summary.total;
  if (total === 0) return null;

  const counts = CATEGORIES.map((c) => summary.byDecision?.[c.key] ?? 0);
  const maxVal = Math.max(...counts);

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      aria-label="Reconciliation outcome distribution"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Reconciliation Outcome
        </h3>
        <p className="text-[11px] text-slate-400">
          {total} records &middot; {Math.round(((summary.byDecision?.MATCHED ?? 0) / total) * 100)}% auto-matched
        </p>
      </div>

      <div
        className="mt-4 flex items-end justify-center gap-3 sm:gap-5"
        style={{ height: CHART_HEIGHT_PX }}
        role="list"
        aria-label="Outcome counts"
      >
        {CATEGORIES.map((cat) => {
          const count = summary.byDecision?.[cat.key] ?? 0;
          const barHeight = maxVal > 0 ? (count / maxVal) * CHART_HEIGHT_PX : 0;
          const showBar = count > 0;

          return (
            <div
              key={cat.key}
              className="flex flex-col items-center justify-end"
              style={{ height: CHART_HEIGHT_PX }}
              role="listitem"
              aria-label={`${cat.label}: ${count} of ${total}`}
            >
              {/* Count label */}
              <span className="mb-1 text-xs font-bold tabular-nums text-slate-700">
                {count}
              </span>

              {/* Bar */}
              <div
                className={`w-10 sm:w-12 rounded-t-md ${showBar ? cat.color : ""} transition-all duration-500`}
                style={{
                  height: showBar ? Math.max(barHeight, 4) : 0,
                  backgroundColor: showBar ? undefined : "transparent",
                }}
                aria-hidden
              />

              {/* Category label */}
              <span className="mt-2 text-[10px] font-medium text-slate-500 whitespace-nowrap">
                {cat.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Baseline */}
      <div className="mt-0 h-px bg-slate-200" aria-hidden />
    </section>
  );
}
