export interface LearnedPatternItem {
  id: string;
  transactionId: string | null;
  originalDecision: string;
  correctedDecision: string;
  correctionType: string;
  explanation: string;
  createdAt?: string;
}

/** Card visualising one stored human correction ("learned pattern"). */
export default function LearnedPattern({
  item,
}: {
  item: LearnedPatternItem;
}) {
  const confirmed = item.originalDecision === item.correctedDecision;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
          {item.correctionType}
        </span>
        {item.createdAt && (
          <time className="text-[11px] text-slate-400">
            {new Date(item.correctionType === 'CONFIRMED_REVIEW' || confirmed ? item.createdAt : item.createdAt).toLocaleString()}
          </time>
        )}
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <DecisionChip label={item.originalDecision} tone="muted" />
        <span aria-hidden className="text-slate-400">
          →
        </span>
        <DecisionChip label={item.correctedDecision} tone="strong" />
      </div>

      {confirmed && (
        <p className="mt-1.5 text-[10px] font-medium text-slate-500">
          Outcome confirmed · reasoning or error category corrected for future pattern recall
        </p>
      )}

      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        {item.explanation}
      </p>

      {item.transactionId && (
        <p className="mt-2 font-mono text-xs text-slate-500">
          transaction: {item.transactionId}
        </p>
      )}
    </article>
  );
}

function DecisionChip({
  label,
  tone,
}: {
  label: string;
  tone: "muted" | "strong";
}) {
  const cls =
    tone === "muted"
      ? "bg-slate-100 text-slate-600 ring-slate-200"
      : "bg-indigo-50 text-indigo-700 ring-indigo-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}
