"use client";

import { useState } from "react";
import DecisionBadge from "../ui/DecisionBadge";

export interface ReviewItem {
  transactionId: string;
  decision: string;
  confidence: number;
  reason: string;
  source: string;
  aiStatus?: "AI_SUCCESS" | "AI_FALLBACK" | "AI_SKIPPED" | "AI_NOT_REQUESTED";
  evidence: Array<{ field: string }>;
  risk?: { score: number; level: string; signals: string[] };
  anomaly?: { isAnomalous: boolean; anomalyScore: number; severity: string | null; signals: Array<{ type: string; severity: string; title: string }> };
  resolution?: { priority: string; action: string; title: string };
}

interface Props {
  decisions: ReviewItem[];
  onItemClick: (item: ReviewItem) => void;
}

const RISK_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const ANOMALY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const RISK_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  HIGH: { bg: "bg-rose-100", text: "text-rose-700", dot: "bg-rose-500" },
  MEDIUM: { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  LOW: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
};

export default function DashboardReviewQueue({ decisions, onItemClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const reviews = decisions
    .filter((d) => d.decision === "REVIEW")
    .sort((a, b) => {
      const aOrder = RISK_ORDER[a.risk?.level ?? "LOW"] ?? 3;
      const bOrder = RISK_ORDER[b.risk?.level ?? "LOW"] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (b.risk?.score ?? 0) - (a.risk?.score ?? 0);
    });

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
          {(expanded ? reviews : reviews.slice(0, 10)).map((r) => {
            const riskStyle = RISK_STYLES[r.risk?.level ?? "LOW"] ?? RISK_STYLES.LOW;
            return (
              <li key={r.transactionId}>
                <button type="button" onClick={() => onItemClick(r)}
                  className="w-full px-5 py-3 text-left transition hover:bg-indigo-50/50 focus-visible:bg-indigo-50/50 focus-visible:outline-none">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900">{r.transactionId}</span>
                      <DecisionBadge decision={r.decision} />
                      {r.risk && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskStyle.bg} ${riskStyle.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${riskStyle.dot}`} />
                          {r.risk.level} {r.risk.score}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold tabular-nums text-slate-600">{Math.round(r.confidence * 100)}%</span>
                      <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        r.aiStatus === "AI_SUCCESS" ? "bg-violet-100 text-violet-700" :
                        r.aiStatus === "AI_FALLBACK" ? "bg-amber-100 text-amber-700" :
                        r.aiStatus === "AI_SKIPPED" ? "bg-slate-100 text-slate-500" :
                        r.aiStatus === "AI_NOT_REQUESTED" ? "bg-slate-100 text-slate-400" :
                        r.source === "OLLAMA" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
                      }`}>{
                        r.aiStatus === "AI_SUCCESS" ? "AI INVESTIGATED" :
                        r.aiStatus === "AI_FALLBACK" ? "AI INCONCLUSIVE" :
                        r.aiStatus === "AI_SKIPPED" ? "AI SKIPPED" :
                        r.aiStatus === "AI_NOT_REQUESTED" ? "AI NOT REQUESTED" :
                        r.source
                      }</span>
                    </div>
                  </div>
                  {r.risk && r.risk.signals.length > 0 && (
                    <p className="mt-1 truncate text-[11px] text-slate-500">{r.risk.signals[0]}</p>
                  )}
                  {r.resolution && (
                    <p className="mt-0.5 truncate text-[11px] text-indigo-600 font-medium">{'\u2192'} {r.resolution.action}</p>
                  )}
                  <p className="mt-0.5 truncate text-xs text-slate-600">{r.reason}</p>
                </button>
              </li>
            );
          })}
          {reviews.length > 10 && (
            <li>
              <button type="button" onClick={() => setExpanded(!expanded)}
                className="w-full px-5 py-2.5 text-center text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-700">
                {expanded ? "Show fewer cases" : `Show all ${reviews.length} cases`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}




