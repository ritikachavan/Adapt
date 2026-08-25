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

const RISK_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  HIGH: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  MEDIUM: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  LOW: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
};

const AI_STYLES: Record<string, { bg: string; text: string }> = {
  AI_SUCCESS: { bg: "bg-violet-50", text: "text-violet-700" },
  AI_FALLBACK: { bg: "bg-amber-50", text: "text-amber-700" },
  AI_SKIPPED: { bg: "bg-slate-50", text: "text-slate-500" },
  AI_NOT_REQUESTED: { bg: "bg-slate-50", text: "text-slate-400" },
};

const AI_LABELS: Record<string, string> = {
  AI_SUCCESS: "AI INVESTIGATED",
  AI_FALLBACK: "AI FALLBACK",
  AI_SKIPPED: "AI SKIPPED",
  AI_NOT_REQUESTED: "AI NOT REQUESTED",
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
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Exception Queue</h2>
        <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-700 ring-1 ring-inset ring-amber-200">
          {reviews.length} open
        </span>
      </div>
      {reviews.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-5 w-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm font-medium text-emerald-700">All clear</p>
          <p className="mt-0.5 text-xs text-slate-400">No exceptions require attention.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {(expanded ? reviews : reviews.slice(0, 10)).map((r) => {
            const riskStyle = RISK_STYLES[r.risk?.level ?? "LOW"] ?? RISK_STYLES.LOW;
            const aiStyle = AI_STYLES[r.aiStatus ?? ""] ?? { bg: "bg-slate-50", text: "text-slate-500" };
            const aiLabel = AI_LABELS[r.aiStatus ?? ""] ?? r.source;
            return (
              <li key={r.transactionId}>
                <button type="button" onClick={() => onItemClick(r)}
                  className="w-full px-4 py-2.5 text-left transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-slate-800">{r.transactionId}</span>
                      <DecisionBadge decision={r.decision} />
                      {r.risk && (
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${riskStyle.bg} ${riskStyle.text}`}>
                          <span className={`h-1 w-1 rounded-full ${riskStyle.dot}`} />
                          {r.risk.level}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold tabular-nums text-slate-500">{Math.round(r.confidence * 100)}%</span>
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${aiStyle.bg} ${aiStyle.text}`}>{aiLabel}</span>
                    </div>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{r.reason}</p>
                  {r.resolution && (
                    <p className="mt-0.5 truncate text-[11px] text-indigo-600 font-medium">{'\u2192'} {r.resolution.action}</p>
                  )}
                </button>
              </li>
            );
          })}
          {reviews.length > 10 && (
            <li>
              <button type="button" onClick={() => setExpanded(!expanded)}
                className="w-full px-4 py-2 text-center text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-700">
                {expanded ? "Show fewer" : `Show all ${reviews.length} cases`}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
