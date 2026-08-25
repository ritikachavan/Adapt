"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import DecisionBadge from "../ui/DecisionBadge";

interface InvestigationStep {
  label: string;
  status: "complete" | "warning" | "info";
  detail: string;
}

interface CandidateRecord {
  id: string;
  amount: number;
  fee: number;
  settlementDate: string;
  paymentId: string;
  amountMatch: boolean;
  referenceMatch: boolean;
}

interface InvestigationResult {
  transactionId: string;
  steps: InvestigationStep[];
  settlementCandidates: CandidateRecord[];
  evidence: {
    expectedAmount: number | null;
    candidateAmounts: number[];
    paymentReference: string | null;
    settlementReferences: string[];
    amountMatch: boolean | null;
    referenceMatch: boolean | null;
    settlementDateAvailable: boolean;
  };
  recommendation: "MATCH_CANDIDATE" | "REVIEW";
  confidence: number;
  reason: string;
  humanReviewRequired: boolean;
  controlPlan: {
    finding: string;
    evidence: string;
    uncertainty: string;
    missingEvidence: string[];
    recommendedAction: string;
    actionType: string;
    authority: string;
  };
  whyUnresolved: string | null;
  whatWouldResolve: string[];
  remainingRiskSignals: string[];
}

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
  aiStatus?: "AI_SUCCESS" | "AI_FALLBACK" | "AI_SKIPPED" | "AI_NOT_REQUESTED";
  evidence: EvidenceItem[];
  risk?: { score: number; level: string; signals: string[] };
  anomaly?: { isAnomalous: boolean; anomalyScore: number; severity: string | null; signals: Array<{ type: string; severity: string; title: string; explanation: string; evidence: string[] }> };
  resolution?: { priority: string; action: string; title: string; rationale: string; steps: Array<{ order: number; action: string }>; supportingSignals: string[] };
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
  const [investigation, setInvestigation] = useState<InvestigationResult | null>(null);
  const [investigating, setInvestigating] = useState(false);
  const [investigateError, setInvestigateError] = useState<string | null>(null);

  const runInvestigation = useCallback(async () => {
    if (!decision) return;
    setInvestigating(true);
    setInvestigateError(null);
    setInvestigation(null);
    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: decision.transactionId }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setInvestigateError(err.error || "Investigation failed");
        return;
      }
      setInvestigation((await res.json()) as InvestigationResult);
    } catch {
      setInvestigateError("Could not reach the investigation API.");
    } finally {
      setInvestigating(false);
    }
  }, [decision]);

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
              decision.aiStatus === "AI_SUCCESS" ? "bg-violet-100 text-violet-700" :
              decision.aiStatus === "AI_FALLBACK" ? "bg-amber-100 text-amber-700" :
              decision.aiStatus === "AI_SKIPPED" ? "bg-slate-100 text-slate-500" :
              decision.aiStatus === "AI_NOT_REQUESTED" ? "bg-slate-100 text-slate-400" :
              decision.source === "OLLAMA" ? "bg-violet-100 text-violet-700" :
              decision.source === "HUMAN_REVIEW" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"
            }`}>{
              decision.aiStatus === "AI_SUCCESS" ? "AI Judge (Ollama) — Investigated" :
              decision.aiStatus === "AI_FALLBACK" ? "AI Judge — Fallback (Human Review Required)" :
              decision.aiStatus === "AI_SKIPPED" ? "AI Judge — Not Escalated" :
              decision.aiStatus === "AI_NOT_REQUESTED" ? "AI Judge — Not Requested" :
              SRC[decision.source] ?? decision.source
            }</span>
          </div>
        </div>
        <div className="space-y-6 px-6 py-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision Reason</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-800">{decision.reason}</p>
            {decision.aiStatus === "AI_FALLBACK" && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-800">Status: INCONCLUSIVE</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">AI could not establish sufficient evidence for an automated verdict. The transaction remains in safe REVIEW for human evaluation.</p>
              </div>
            )}
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
          {decision.anomaly && <AnomalySignals anomaly={decision.anomaly} />}
          {decision.resolution && <ResolutionIntelligence resolution={decision.resolution} />}
          <ExplainDecision decision={decision} c={c} />
          <InvestigationSection
            decision={decision}
            investigation={investigation}
            investigating={investigating}
            investigateError={investigateError}
            onRun={runInvestigation}
          />
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






function AnomalySignals({ anomaly }: { anomaly: { isAnomalous: boolean; anomalyScore: number; severity: string | null; signals: Array<{ type: string; severity: string; title: string; explanation: string; evidence: string[] }> } }) {
  if (!anomaly.isAnomalous) {
    return (
      <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Anomaly Intelligence</h3>
        <p className="mt-2 text-sm text-emerald-700">No significant anomaly detected.</p>
      </section>
    );
  }

  const levelStyles: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    HIGH: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", dot: "bg-rose-500" },
    MEDIUM: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
    LOW: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
  };
  const s = levelStyles[anomaly.severity ?? "LOW"] ?? levelStyles.LOW;

  return (
    <section className={`rounded-lg border ${s.border} ${s.bg} p-4`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Anomaly Intelligence</h3>
      <div className="mt-2 flex items-center gap-3">
        <span className={`text-2xl font-bold tabular-nums ${s.text}`}>{anomaly.anomalyScore}</span>
        <span className="text-xs text-slate-500">/ 100</span>
        {anomaly.severity && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.bg} ${s.text} ring-1 ring-inset ${s.border}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {anomaly.severity}
          </span>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {anomaly.signals.slice(0, 3).map((sig, i) => (
          <div key={i} className="rounded-md bg-white/60 p-2">
            <p className="text-xs font-semibold text-slate-800">{sig.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{sig.explanation}</p>
          </div>
        ))}
      </div>
    </section>
  );
}


function ResolutionIntelligence({ resolution }: { resolution: { priority: string; action: string; title: string; rationale: string; steps: Array<{ order: number; action: string }>; supportingSignals: string[] } }) {
  const priorityStyles: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    HIGH: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", dot: "bg-rose-500" },
    MEDIUM: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
    LOW: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  };
  const s = priorityStyles[resolution.priority] ?? priorityStyles.LOW;

  return (
    <section className={`rounded-lg border ${s.border} ${s.bg} p-4`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Resolution Intelligence</h3>
      <div className="mt-2 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.bg} ${s.text} ring-1 ring-inset ${s.border}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {resolution.priority} PRIORITY
        </span>
      </div>
      <p className={`mt-2 text-sm font-semibold ${s.text}`}>{resolution.action}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{resolution.rationale}</p>
      {resolution.steps.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Recommended Checks</p>
          <ol className="mt-1.5 space-y-1">
            {resolution.steps.map((step) => (
              <li key={step.order} className="flex items-start gap-2 text-xs text-slate-700">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-white text-[9px] font-bold text-slate-500">{step.order}</span>
                {step.action}
              </li>
            ))}
          </ol>
        </div>
      )}
      {resolution.supportingSignals.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Supporting Signals</p>
          <ul className="mt-1.5 space-y-0.5">
            {resolution.supportingSignals.slice(0, 3).map((sig, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                <span className={`mt-0.5 h-1 w-1 flex-shrink-0 rounded-full ${s.dot}`} />
                {sig}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 rounded-md bg-white/60 p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Human Decision Required</p>
        <p className="mt-0.5 text-[11px] text-slate-600">This recommendation requires human review and approval before any action is taken.</p>
      </div>
    </section>
  );
}

function InvestigationSection({ decision, investigation, investigating, investigateError, onRun }: {
  decision: DrawerDecision;
  investigation: InvestigationResult | null;
  investigating: boolean;
  investigateError: string | null;
  onRun: () => void;
}) {
  const stepIcon = (status: string) => {
    if (status === "complete") return <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>;
    if (status === "warning") return <svg className="h-3.5 w-3.5 text-amber-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>;
    return <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>;
  };

  return (
    <section className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Investigation Agent</h3>
        {!investigation && !investigating && (
          <button type="button" onClick={onRun} className="rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-indigo-700">Run Investigation</button>
        )}
      </div>
      {investigating && <div className="mt-3 flex items-center gap-2 text-xs text-indigo-600"><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Investigating…</div>}
      {investigateError && <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{investigateError}</div>}
      {investigation && <InvestigationResults investigation={investigation} stepIcon={stepIcon} />}
    </section>
  );
}

function InvestigationResults({ investigation, stepIcon }: { investigation: InvestigationResult; stepIcon: (s: string) => React.ReactNode }) {
  return (
    <div className="mt-3 space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Investigation Progress</p>
        <ol className="mt-2 space-y-2">
          {investigation.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0">{stepIcon(step.status)}</span>
              <div><p className="text-[11px] font-semibold text-slate-800">{step.label}</p><p className="text-[11px] text-slate-500">{step.detail}</p></div>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Evidence</p>
        <div className="mt-2 space-y-1.5 text-[11px]">
          <div className="flex justify-between"><span className="text-slate-500">Expected amount</span><span className="font-mono font-semibold text-slate-800">{investigation.evidence.expectedAmount !== null ? `₹${investigation.evidence.expectedAmount}` : "NOT AVAILABLE"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Candidate amounts</span><span className="font-mono font-semibold text-slate-800">{investigation.evidence.candidateAmounts.length > 0 ? investigation.evidence.candidateAmounts.map((a) => `₹${a}`).join(", ") : "NONE"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Amount match</span><span className={`font-mono font-semibold ${investigation.evidence.amountMatch === true ? "text-emerald-700" : investigation.evidence.amountMatch === false ? "text-rose-700" : "text-slate-400"}`}>{investigation.evidence.amountMatch === true ? "YES" : investigation.evidence.amountMatch === false ? "NO" : "N/A"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Payment reference</span><span className="font-mono font-semibold text-slate-800">{investigation.evidence.paymentReference ?? "NOT AVAILABLE"}</span></div>
        </div>
      </div>
      {investigation.settlementCandidates.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Settlement Candidates ({investigation.settlementCandidates.length})</p>
          <div className="mt-2 space-y-2">
            {investigation.settlementCandidates.map((c) => (
              <div key={c.id} className="rounded-md border border-slate-200 bg-white p-2.5">
                <p className="font-mono text-[11px] font-semibold text-slate-800">{c.id}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                  <span className="text-slate-500">Amount: <span className="font-mono font-semibold text-slate-700">₹{c.amount}</span></span>
                  <span className={c.amountMatch ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>{c.amountMatch ? "Amount ✓" : "Amount ✗"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className={`rounded-lg border p-3 ${investigation.recommendation === "MATCH_CANDIDATE" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Agent Recommendation</p>
        <p className={`mt-1 text-sm font-bold ${investigation.recommendation === "MATCH_CANDIDATE" ? "text-emerald-700" : "text-amber-700"}`}>{investigation.recommendation === "MATCH_CANDIDATE" ? "MATCH CANDIDATE" : "REVIEW"}</p>
        <p className="mt-0.5 text-xs text-slate-600">{Math.round(investigation.confidence * 100)}% confidence</p>
        <p className="mt-1 text-xs text-slate-700">{investigation.reason}</p>
        {investigation.humanReviewRequired && <div className="mt-2 rounded-md bg-white/60 p-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Human Decision Required</p></div>}
      </div>

      {/* Why unresolved? */}
      {investigation.whyUnresolved && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Why can&apos;t Adapt resolve this?</p>
          <p className="mt-1 text-[11px] text-amber-800">{investigation.whyUnresolved}</p>
        </div>
      )}

      {/* What would resolve this? */}
      {investigation.whatWouldResolve.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What would resolve this?</p>
          <ul className="mt-1.5 space-y-1">
            {investigation.whatWouldResolve.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-700">
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Remaining Risk Signals */}
      {investigation.remainingRiskSignals.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">Remaining Risk</p>
          <ul className="mt-1.5 space-y-1">
            {investigation.remainingRiskSignals.map((sig, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-rose-800">
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-400" />
                {sig}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Control Plan */}
      <div className="rounded-lg border border-slate-300 bg-slate-50 p-3 space-y-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Control Plan</p>
        <div>
          <p className="text-[10px] font-semibold text-slate-500">Finding</p>
          <p className="text-[11px] text-slate-800">{investigation.controlPlan.finding}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-500">Evidence</p>
          <p className="text-[11px] text-slate-800">{investigation.controlPlan.evidence}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-500">Uncertainty</p>
          <p className="text-[11px] text-slate-800">{investigation.controlPlan.uncertainty}</p>
        </div>
        {investigation.controlPlan.missingEvidence.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-slate-500">Missing Evidence</p>
            <ul className="mt-1 space-y-0.5">
              {investigation.controlPlan.missingEvidence.map((m, i) => (
                <li key={i} className="text-[11px] text-rose-700">• {m}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold text-slate-500">Recommended Action</p>
          <p className="text-[11px] font-semibold text-slate-800">{investigation.controlPlan.recommendedAction}</p>
        </div>
        <div className="rounded-md bg-white/80 p-2 border border-slate-200">
          <p className="text-[10px] font-semibold text-slate-500">Authority</p>
          <p className="text-[11px] text-slate-700">{investigation.controlPlan.authority}</p>
        </div>
      </div>
    </div>
  );
}

