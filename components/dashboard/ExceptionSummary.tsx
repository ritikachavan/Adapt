import DecisionBadge from "../ui/DecisionBadge";

export interface ExceptionDecision {
  transactionId: string;
  decision: string;
  confidence: number;
  reason: string;
}

const EXCEPTION_BUCKETS = [
  { decision: "MISMATCH", title: "Amount mismatches", accent: "text-rose-700" },
  { decision: "MISSING", title: "Missing settlements", accent: "text-orange-700" },
  { decision: "REVIEW", title: "Awaiting review", accent: "text-amber-700" },
] as const;

/**
 * Aggregated exception view: every non-MATCHED outcome grouped by class,
 * with a few sample transactions each. Data comes straight from the API.
 */
export default function ExceptionSummary({
  decisions,
}: {
  decisions: ExceptionDecision[];
}) {
  const buckets = EXCEPTION_BUCKETS.map((b) => ({
    ...b,
    items: decisions.filter((d) => d.decision === b.decision),
  }));
  const openExceptions = buckets.reduce((sum, b) => sum + b.items.length, 0);

  if (openExceptions === 0) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Exceptions
        </h2>
        <p className="mt-2 text-sm font-medium text-emerald-800">
          No open exceptions — every case resolved deterministically.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Exceptions needing attention
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
          {openExceptions} open
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {buckets.map((bucket) => (
          <div
            key={bucket.decision}
            className="rounded-lg border border-slate-100 bg-slate-50 p-3"
          >
            <header className="flex items-center justify-between gap-2">
              <h3 className={`text-sm font-semibold ${bucket.accent}`}>
                {bucket.title}
              </h3>
              <DecisionBadge decision={bucket.decision} />
            </header>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800">
              {bucket.items.length}
            </p>
            {bucket.items.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {bucket.items.slice(0, 4).map((item) => (
                  <li
                    key={item.transactionId}
                    className="truncate text-xs text-slate-600"
                    title={item.reason}
                  >
                    <span className="font-mono">{item.transactionId}</span> ·{" "}
                    {item.reason}
                  </li>
                ))}
                {bucket.items.length > 4 && (
                  <li className="text-[11px] italic text-slate-400">
                    +{bucket.items.length - 4} more…
                  </li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}