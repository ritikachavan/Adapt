import DecisionBadge from "../ui/DecisionBadge";

export interface QueueItem {
  transactionId: string;
  decision: string;
  confidence: number;
  reason: string;
}

/** Selectable review queue with loading / empty states. */
export default function ReviewQueue({
  cases,
  selectedId,
  onSelect,
  loading = false,
}: {
  cases: QueueItem[];
  selectedId: string | null;
  onSelect: (transactionId: string) => void;
  loading?: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Review queue
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
          {loading ? "…" : cases.length}
        </span>
      </div>

      {loading ? (
        <ul className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-16 animate-pulse rounded-lg border border-slate-200"
            />
          ))}
        </ul>
      ) : cases.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-6 text-center text-sm font-medium text-emerald-700">
          Queue is clear — no cases are awaiting human review right now.
        </p>
      ) : (
        <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {cases.map((c) => {
            const selected = c.transactionId === selectedId;
            return (
              <li key={c.transactionId}>
                <button
                  type="button"
                  onClick={() => onSelect(c.transactionId)}
                  aria-current={selected || undefined}
                  className={`w-full rounded-lg border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                    selected
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      {c.transactionId}
                    </span>
                    <div className="flex items-center gap-2">
                      <DecisionBadge decision={c.decision} />
                      <span className="text-xs font-semibold tabular-nums text-slate-600">
                        {Math.round(c.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-600">
                    {c.reason}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}