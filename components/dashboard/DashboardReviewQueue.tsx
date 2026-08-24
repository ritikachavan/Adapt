"use client";

import DecisionBadge from "../ui/DecisionBadge";

export interface ReviewItem {
  transactionId: string;
  decision: string;
  confidence: number;
  reason: string;
  source: string;
  evidence: Array<{ field: string }>;
}

interface Props {
  decisions: ReviewItem[];
  onItemClick: (item: ReviewItem) => void;
}

export default function DashboardReviewQueue({ decisions, onItemClick }: Props) {
  const reviews = decisions.filter((d) => d.decision === "REVIEW");

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Review Queue</h2>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-800">
          {reviews.length} case{reviews.length !== 1 ? "s" : ""}
        </span>
      </div>
      {reviews.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm font-medium text-emerald-700">All clear</p>
          <p className="mt-0.5 text-xs text-slate-500">No cases awaiting review.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {reviews.slice(0, 10).map((r) => (
            <li key={r.transactionId}>
              <button type="button" onClick={() => onItemClick(r)}
                className="w-full px-5 py-3 text-left transition hover:bg-indigo-50/50 focus-visible:bg-indigo-50/50 focus-visible:outline-none">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900">{r.transactionId}</span>
                    <DecisionBadge decision={r.decision} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold tabular-nums text-slate-600">{Math.round(r.confidence * 100)}%</span>
                    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${r.source === "OLLAMA" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{r.source}</span>
                    <span className="text-[11px] text-slate-500">{r.evidence.length} evidence</span>
                  </div>
                </div>
                <p className="mt-1 truncate text-xs text-slate-600">{r.reason}</p>
              </button>
            </li>
          ))}
          {reviews.length > 10 && (
            <li className="px-5 py-2 text-center text-xs text-slate-500">+{reviews.length - 10} more cases</li>
          )}
        </ul>
      )}
    </section>
  );
}
