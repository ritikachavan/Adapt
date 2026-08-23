import DecisionBadge from "../ui/DecisionBadge";

/** One readable evidence line coming back from the engine / AI judge. */
export interface EvidenceRow {
  field: string;
  expected?: string | number | null;
  actual?: string | number | null;
  detail?: string;
}

export interface ReviewDetailCase {
  transactionId: string;
  decision: string;
  confidence: number;
  reason: string;
  evidence: EvidenceRow[];
  matchedRecordId: string | null;
}

function EvidenceValue({ value }: { value: string | number | null | undefined }) {
  if (value === undefined || value === null)
    return <span className="text-slate-400">—</span>;
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
      {String(value)}
    </span>
  );
}

/** Full detail panel for one selected review case. */
export default function ReviewDetails({
  item,
}: {
  item: ReviewDetailCase | null;
}) {
  if (!item) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
        <p className="text-sm text-slate-500">
          Select a case from the queue to inspect its evidence.
        </p>
      </div>
    );
  }

  return (
    <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-base font-bold text-slate-900">
          {item.transactionId}
        </h3>
        <div className="flex items-center gap-3">
          <DecisionBadge decision={item.decision} />
          <span className="text-sm font-semibold tabular-nums text-slate-700">
            {Math.round(item.confidence * 100)}% confidence
          </span>
        </div>
      </header>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Engine reason
        </h4>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">
          {item.reason}
        </p>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Matched record
        </h4>
        {item.matchedRecordId ? (
          <p className="mt-1 font-mono text-sm text-slate-700">
            {item.matchedRecordId}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-400">None</p>
        )}
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Evidence
        </h4>
        {item.evidence.length === 0 ? (
          <p className="mt-1 text-sm text-slate-400">
            No structured evidence attached to this decision.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {item.evidence.map((e, index) => (
              <li
                key={`${e.field}-${index}`}
                className="rounded-lg border border-slate-100 bg-slate-50 p-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-slate-800">
                    {e.field}
                  </span>
                  <span className="text-xs text-slate-500">expected</span>
                  <EvidenceValue value={e.expected} />
                  <span className="text-xs text-slate-500">actual</span>
                  <EvidenceValue value={e.actual} />
                </div>
                {e.detail && (
                  <p className="mt-1 text-xs leading-snug text-slate-600">
                    {e.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}