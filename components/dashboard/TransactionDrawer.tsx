"use client";

import { useEffect, useRef } from "react";
import DecisionBadge from "../ui/DecisionBadge";

export interface EvidenceItem {
  field: string;
  expected?: string | number | null;
  actual?: string | number | null;
  detail?: string;
}

export interface DrawerDecision {
  transactionId: string;
  decision: string;
  confidence: number;
  reason: string;
  matchedRecordId: string | null;
  source: string;
  evidence: EvidenceItem[];
  risk?: { score: number; level: string; signals: string[] };
}

interface Props {
  decision: DrawerDecision | null;
  onClose: () => void;
}

const SRC: Record<string, string> = {
  DETERMINISTIC: "Deterministic Engine",
  OLLAMA: "AI Judge (Ollama)",
  HUMAN_REVIEW: "Human Review",
};

const CLR: Record<string, { b: string; bg: string; t: string }> = {
  MATCHED: { b: "border-emerald-300", bg: "bg-emerald-50", t: "text-emerald-800" },
  REVIEW: { b: "border-amber-300", bg: "bg-amber-50", t: "text-amber-800" },
  MISMATCH: { b: "border-rose-300", bg: "bg-rose-50", t: "text-rose-800" },
  MISSING: { b: "border-orange-300", bg: "bg-orange-50", t: "text-orange-800" },
  REFUNDED: { b: "border-sky-300", bg: "bg-sky-50", t: "text-sky-800" },
};

export default function TransactionDrawer({ decision, onClose }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!decision) return;
    btnRef.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [decision, onClose]);

  if (!decision) return null;
  const c = CLR[decision.decision] ?? { b: "border-slate-300", bg: "bg-slate-50", t: "text-slate-800" };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-label={`Transaction ${decision.transactionId} details`}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white shadow-2xl animate-slide-in">
        <div className={`sticky top-0 z-10 border-b ${c.b} ${c.bg} px-6 py-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Transaction Investigation</p>
              <h2 className="mt-1 font-mono text-lg font-bold text-slate-900">{decision.transactionId}</h2>
            </div>
            <button ref={btnRef} type="button" onClick={onClose} aria-label="Close drawer"
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DecisionBadge decision={decision.decision} />
            <span className={`text-sm font-bold tabular-nums ${c.t}`}>{Math.round(decision.confidence * 100)}% confidence</span>
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ${
              decision.source === "OLLAMA" ? "bg-violet-100 text-violet-700" : decision.source === "HUMAN_REVIEW" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"
            }`}>{SRC[decision.source] ?? decision.source}</span>
          </div>
        </div>
        <div className="space-y-6 px-6 py-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision Reason</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-800">{decision.reason}</p>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Matched Record</h3>
            {decision.matchedRecordId ? (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 font-mono text-sm font-semibold text-slate-800">
                <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                {decision.matchedRecordId}
              </p>
            ) : <p className="mt-1.5 text-sm text-slate-400">No record matched</p>}
          </section>
          <EvidenceTimeline evidence={decision.evidence} />
          {decision.risk && <RiskIntelligence risk={decision.risk} />}
          <ExplainDecision decision={decision} c={c} />
        </div>
      </aside>
    </>
  );
}

function EvidenceTimeline({ evidence }: { evidence: EvidenceItem[] }) {
  if (evidence.length === 0) {
    return (
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence Timeline</h3>
        <p className="mt-3 text-sm text-slate-400">No structured evidence attached.</p>
      </section>
    );
  }
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence Timeline</h3>
      <p className="mt-0.5 text-[11px] text-slate-400">How the engine reached this decision</p>
      <ol className="mt-3" aria-label="Evidence timeline">
        {evidence.map((e, i) => {
          const last = i === evidence.length - 1;
          const amb = e.field.includes("duplicate") || e.field.includes("nearDuplicate") || e.field.includes("lookalike");
          return (
            <li key={`${e.field}-${i}`} className="relative flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${amb ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                  {amb ? (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                  ) : <span className="text-[10px] font-bold">{i + 1}</span>}
                </div>
                {!last && <div className={`w-px flex-1 ${amb ? "bg-amber-200" : "bg-indigo-200"}`} />}
              </div>
              <div className={`mb-3 flex-1 rounded-lg border p-3 ${amb ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-white"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-800">{e.field}</span>
                  {amb && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800">Ambiguity</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-slate-500">Expected:</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700">{e.expected ?? "—"}</span>
                  <span className="text-slate-500">Actual:</span>
                  <span className={`rounded px-1.5 py-0.5 font-mono font-semibold ${e.expected !== e.actual ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{e.actual ?? "—"}</span>
                </div>
                {e.detail && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{e.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ExplainDecision({ decision, c }: { decision: DrawerDecision; c: { b: string; bg: string; t: string } }) {
  return (
    <section className={`rounded-lg border ${c.b} ${c.bg} p-4`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Explain Decision</h3>
      <div className="mt-2 space-y-1.5 text-sm">
        <p className={c.t}><span className="font-semibold">Verdict:</span> {decision.decision}</p>
        <p className={c.t}><span className="font-semibold">Confidence:</span> {Math.round(decision.confidence * 100)}%</p>
        <p className={c.t}><span className="font-semibold">Source:</span> {SRC[decision.source] ?? decision.source}</p>
        <p className={c.t}><span className="font-semibold">Evidence items:</span> {decision.evidence.length}</p>
        {decision.source === "OLLAMA" && decision.decision === "REVIEW" && (
          <p className="mt-2 text-xs text-amber-700">⚠ AI could not reach a confident verdict. This case remains in safe REVIEW for human evaluation.</p>
        )}
      </div>
    </section>
  );
}


function RiskIntelligence({ risk }: { risk: { score: number; level: string; signals: string[] } }) {
  const levelStyles: Record<string, { bg: string; border: string; text: string; bar: string }> = {
    HIGH: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", bar: "bg-rose-500" },
    MEDIUM: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", bar: "bg-amber-500" },
    LOW: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", bar: "bg-emerald-500" },
  };
  const s = levelStyles[risk.level] ?? levelStyles.LOW;
  return (
    <section className={`rounded-lg border ${s.border} ${s.bg} p-4`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Risk Intelligence</h3>
      <div className="mt-2 flex items-center gap-3">
        <span className={`text-2xl font-bold tabular-nums ${s.text}`}>{risk.score}</span>
        <span className="text-xs text-slate-500">/ 100</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.bg} ${s.text} ring-1 ring-inset ${s.border}`}>
          {risk.level}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-white">
        <div className={`h-1.5 rounded-full ${s.bar} transition-all duration-500`} style={{ width: `${risk.score}%` }} />
      </div>
      {risk.signals.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Investigation Priority</p>
          <ul className="mt-1.5 space-y-1">
            {risk.signals.slice(0, 3).map((sig, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                <span className={`mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${s.bar}`} />
                {sig}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}







