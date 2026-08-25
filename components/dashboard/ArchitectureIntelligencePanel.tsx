"use client";

import { useState } from "react";

interface AiMetrics {
  aiEnabled: boolean;
  aiProvider: string | null;
  aiEscalatedCount: number;
  aiSuccessCount: number;
  aiFallbackCount: number;
  aiSkippedCount: number;
}

interface Props {
  aiMetrics: AiMetrics;
}

const PIPELINE = [
  { tag: "DETERMINISTIC", tagColor: "bg-slate-100 text-slate-600", title: "Reconciliation", desc: "Establishes the reconciliation result from transaction and settlement records." },
  { tag: "DETERMINISTIC", tagColor: "bg-slate-100 text-slate-600", title: "Risk + Anomaly Intelligence", desc: "Scores investigation urgency and identifies unusual evidence patterns." },
  { tag: "AI", tagColor: "bg-violet-100 text-violet-700", title: "AI Judge", desc: "Provides structured reasoning for ambiguous reconciliation cases." },
  { tag: "AGENT", tagColor: "bg-indigo-100 text-indigo-700", title: "Investigation Agent", desc: "Searches actual records, compares evidence, assesses uncertainty, and recommends next steps." },
  { tag: "HUMAN", tagColor: "bg-emerald-100 text-emerald-700", title: "Human Authority", desc: "Final financial decisions remain with the human reviewer." },
] as const;

const RISK_FACTORS = [
  { weight: 30, label: "Amount discrepancy", desc: "Normalized gap between expected and actual settlement" },
  { weight: 20, label: "Candidate ambiguity", desc: "Number of possible matching records" },
  { weight: 15, label: "Weak evidence", desc: "Proportion of null or missing evidence fields" },
  { weight: 10, label: "Data quality", desc: "Completeness of available data fields" },
  { weight: 5, label: "Temporal inconsistency", desc: "Suspicious settlement delays" },
  { weight: 15, label: "Decision severity", desc: "MISSING (0.9), MISMATCH (0.8), REVIEW (0.5), REFUNDED (0.1)" },
  { weight: 5, label: "AI fallback", desc: "AI judge fell back to safe REVIEW" },
] as const;

export default function ArchitectureIntelligencePanel({ aiMetrics }: Props) {
  const [openRisk, setOpenRisk] = useState(false);
  const [openAnomaly, setOpenAnomaly] = useState(false);
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="How ADAPT decides">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">How ADAPT Decides</h3>
        <p className="mt-0.5 text-[11px] text-slate-400">Deterministic reconciliation → intelligence layers → bounded AI → human authority</p>
      </div>
      <div className="px-4 py-3 space-y-4">
        <PipelineView />
        <RiskSection open={openRisk} onToggle={setOpenRisk} />
        <AnomalySection open={openAnomaly} onToggle={setOpenAnomaly} />
        <AIRoutingSection aiMetrics={aiMetrics} />
        <SafetyBoundary />
        <p className="text-[10px] leading-relaxed text-slate-400">Ollama provides local/offline LLM reasoning during development. The AI Judge is isolated behind the AI layer, allowing the underlying model/provider to be replaced for production deployment.</p>
      </div>
    </section>
  );
}

function PipelineView() {
  return (
    <div className="space-y-0" aria-label="Decision pipeline">
      {PIPELINE.map((stage, i) => (
        <div key={stage.title} className="flex items-start gap-3">
          <div className="flex flex-col items-center pt-0.5">
            <div className="h-2 w-2 rounded-full bg-slate-300 flex-shrink-0" />
            {i < PIPELINE.length - 1 && <div className="w-px flex-1 bg-slate-200 min-h-[20px]" />}
          </div>
          <div className="pb-3 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-800">{stage.title}</span>
              <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${stage.tagColor}`}>{stage.tag}</span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{stage.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );
}

function RiskSection({ open, onToggle }: { open: boolean; onToggle: (v: boolean) => void }) {
  return (
    <details className="group rounded-md border border-slate-100" open={open} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 select-none">
        <span>How risk is scored</span>
        <Chevron open={open} />
      </summary>
      <div className="border-t border-slate-100 px-3 py-2.5 space-y-2">
        <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
          Score = 30×amountDiscrepancy + 20×candidateAmbiguity + 15×weakEvidence + 10×dataQuality + 5×temporalInconsistency + 15×decisionSeverity + 5×aiFallback
        </p>
        <div className="flex gap-3 text-[10px]">
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">&lt; 30 → LOW</span>
          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">30–69 → MEDIUM</span>
          <span className="rounded bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700">70+ → HIGH</span>
        </div>
        <ul className="space-y-1">
          {RISK_FACTORS.map((f) => (
            <li key={f.label} className="flex items-start gap-2 text-[11px] text-slate-600">
              <span className="mt-0.5 w-5 flex-shrink-0 text-right font-bold tabular-nums text-slate-800">{f.weight}×</span>
              <span><span className="font-medium text-slate-700">{f.label}</span> — {f.desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function AnomalySection({ open, onToggle }: { open: boolean; onToggle: (v: boolean) => void }) {
  return (
    <details className="group rounded-md border border-slate-100" open={open} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 select-none">
        <span>How anomaly severity works</span>
        <Chevron open={open} />
      </summary>
      <div className="border-t border-slate-100 px-3 py-2.5 space-y-2">
        <p className="text-[11px] text-slate-600">Each anomaly signal contributes a score based on its severity. Multiple independent signals combine into a higher overall severity.</p>
        <div className="flex gap-3 text-[10px]">
          <span className="rounded bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-700">HIGH signal → 35</span>
          <span className="rounded bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-700">MEDIUM signal → 20</span>
          <span className="rounded bg-slate-50 px-1.5 py-0.5 font-semibold text-slate-700">LOW signal → 10</span>
        </div>
        <div className="flex gap-3 text-[10px]">
          <span className="rounded bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700">60+ → HIGH</span>
          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">30+ → MEDIUM</span>
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">&gt; 0 → LOW</span>
        </div>
      </div>
    </details>
  );
}

function AIRoutingSection({ aiMetrics }: { aiMetrics: AiMetrics }) {
  const items = [
    { label: "Escalated", value: aiMetrics.aiEscalatedCount, color: "text-indigo-700" },
    { label: "Success", value: aiMetrics.aiSuccessCount, color: "text-emerald-700" },
    { label: "Fallback", value: aiMetrics.aiFallbackCount, color: "text-amber-700" },
    { label: "Skipped", value: aiMetrics.aiSkippedCount, color: "text-slate-600" },
  ];
  return (
    <div className="rounded-md border border-slate-100 px-3 py-2.5">
      <p className="text-[11px] font-semibold text-slate-600">AI routing</p>
      <p className="mt-0.5 text-[11px] text-slate-500">The AI is selectively used for ambiguous cases rather than replacing deterministic reconciliation.</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {items.map((m) => (
          <div key={m.label} className="rounded bg-slate-50 px-2 py-1.5 text-center">
            <p className={`text-sm font-bold tabular-nums ${m.color}`}>{m.value}</p>
            <p className="text-[9px] font-medium text-slate-500">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SafetyBoundary() {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2.5">
      <p className="text-[11px] font-semibold text-emerald-800">Financial safety boundary</p>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-emerald-700 flex-wrap">
        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-emerald-200">Recommendation only</span>
        <span className="text-emerald-400">→</span>
        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-emerald-200">No automatic mutation</span>
        <span className="text-emerald-400">→</span>
        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-emerald-200">Human approval required</span>
      </div>
    </div>
  );
}
