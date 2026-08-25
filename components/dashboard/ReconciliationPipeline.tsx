"use client";

import { useEffect, useState } from "react";

export type PipelineStatus = "IDLE" | "PROCESSING" | "AI_PROCESSING" | "COMPLETE";

export interface PipelineData {
  total: number;
  matched: number;
  reviewed: number;
  mismatched: number;
  missing: number;
  refunded: number;
  aiEscalatedCount: number;
  aiSuccessCount: number;
  aiFallbackCount: number;
  aiEnabled: boolean;
  anomalyCount?: number;
}

interface Props {
  status: PipelineStatus;
  data: PipelineData | null;
  aiMode: boolean;
  onStageClick?: (filter: string) => void;
}

const STAGE_DURATION = 600;

export default function ReconciliationPipeline({ status, data, aiMode, onStageClick }: Props) {
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    if (status === "IDLE" || status === "COMPLETE") { setActiveStage(0); return; }
    setActiveStage(1);
    const stages = aiMode ? 6 : 5;
    const timers: NodeJS.Timeout[] = [];
    for (let i = 2; i <= stages; i++) timers.push(setTimeout(() => setActiveStage(i), STAGE_DURATION * (i - 1)));
    return () => timers.forEach(clearTimeout);
  }, [status, aiMode]);

  const exceptions = data ? data.reviewed + data.mismatched + data.missing + data.refunded : 0;
  const humanReview = data ? data.reviewed - data.aiSuccessCount : 0;

  const stages = [
    { id: "transactions", title: "Transactions", count: data?.total ?? 0, desc: "Financial records", color: "bg-slate-600", ring: "ring-slate-300", text: "text-slate-700", clickable: false, filter: null },
    { id: "deterministic", title: "Deterministic", count: data ? data.matched + data.reviewed + data.mismatched + data.missing + data.refunded : 0, desc: "Rule-based engine", color: "bg-indigo-600", ring: "ring-indigo-300", text: "text-indigo-700", clickable: false, filter: null },
    { id: "matched", title: "Matched", count: data?.matched ?? 0, desc: "Auto-resolved", color: "bg-emerald-600", ring: "ring-emerald-300", text: "text-emerald-700", clickable: true, filter: "MATCHED" },
    { id: "exceptions", title: "Non-Matched", count: exceptions, desc: "All non-matched records", color: "bg-amber-600", ring: "ring-amber-300", text: "text-amber-700", clickable: true, filter: "EXCEPTIONS" },
    { id: "anomaly-detection", title: "Anomalies", count: data?.anomalyCount ?? 0, desc: "Pattern intelligence", color: "bg-orange-600", ring: "ring-orange-300", text: "text-orange-700", clickable: false, filter: null },
    { id: "ai-judge", title: "AI Judge", count: data?.aiEscalatedCount ?? 0, desc: data?.aiEnabled ? `${data.aiSuccessCount} success, ${data.aiFallbackCount} fallback` : "Not invoked", color: "bg-violet-600", ring: "ring-violet-300", text: "text-violet-700", clickable: false, filter: "OLLAMA" },
    { id: "human-review", title: "Human Review", count: Math.max(0, humanReview), desc: "Awaiting decision", color: "bg-rose-600", ring: "ring-rose-300", text: "text-rose-700", clickable: true, filter: "REVIEW" },
  ];

  const isStageActive = (i: number) => status !== "COMPLETE" && status !== "IDLE" && i === activeStage;
  const isStageCompleted = (i: number) => status === "COMPLETE" ? true : status === "IDLE" ? false : i < activeStage;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Reconciliation pipeline">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Live Pipeline</h2>
        <StatusBadge status={status} aiMode={aiMode} aiFallbackCount={data?.aiFallbackCount ?? 0} />
      </div>
      <div className="p-5">
        <div className="hidden md:flex md:items-start md:gap-0">
          {stages.map((stage, i) => (
            <div key={stage.id} className="flex items-start">
              <Stage stage={stage} index={i} active={isStageActive(i)} completed={isStageCompleted(i)} status={status} onClick={onStageClick} />
              {i < stages.length - 1 && <Connector active={isStageActive(i)} completed={isStageCompleted(i)} status={status} />}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-0 md:hidden">
          {stages.map((stage, i) => (
            <div key={stage.id} className="flex items-start">
              <Stage stage={stage} index={i} active={isStageActive(i)} completed={isStageCompleted(i)} status={status} onClick={onStageClick} vertical />
              {i < stages.length - 1 && <Connector active={isStageActive(i)} completed={isStageCompleted(i)} status={status} vertical />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface StageProps {
  stage: { id: string; title: string; count: number; desc: string; color: string; ring: string; text: string; clickable: boolean; filter: string | null };
  index: number;
  active: boolean;
  completed: boolean;
  status: PipelineStatus;
  onClick?: (filter: string) => void;
  vertical?: boolean;
}

function Stage({ stage, index, active, completed, status, onClick, vertical }: StageProps) {
  const showCount = status === "COMPLETE" || active;
  const Wrapper = stage.clickable && status === "COMPLETE" ? "button" : "div";
  const wrapperProps = stage.clickable && status === "COMPLETE" && stage.filter && onClick
    ? { type: "button" as const, onClick: () => onClick(stage.filter!), className: "group cursor-pointer", "aria-label": `Filter by ${stage.title}` }
    : { className: "group" };

  return (
    <Wrapper {...wrapperProps}>
      <div className={`flex ${vertical ? "flex-row items-center gap-3" : "flex-col items-center"} min-w-[80px] ${active ? "animate-stage-pulse" : ""}`}>
        <div className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 ${
          active ? `${stage.color} border-transparent text-white shadow-lg ${stage.ring} ring-4`
            : completed ? `${stage.color} border-transparent text-white`
            : "border-slate-200 bg-white text-slate-400"
        }`}>
          {completed && !active ? (
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          ) : (
            <span className="text-xs font-bold">{index + 1}</span>
          )}
          {active && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500" />
            </span>
          )}
        </div>
        <div className={vertical ? "flex-1" : "mt-2 text-center"}>
          <p className={`text-[11px] font-semibold ${active ? stage.text : completed ? "text-slate-700" : "text-slate-400"}`}>{stage.title}</p>
          {showCount && <p className={`text-base font-bold tabular-nums ${active ? stage.text : completed ? "text-slate-800" : "text-slate-300"}`}>{stage.count}</p>}
          {status === "COMPLETE" && <p className="mt-0.5 text-[10px] leading-tight text-slate-500">{stage.desc}</p>}
        </div>
      </div>
    </Wrapper>
  );
}

function Connector({ active, completed, status, vertical }: { active: boolean; completed: boolean; status: PipelineStatus; vertical?: boolean }) {
  if (status === "IDLE") {
    return vertical ? <div className="ml-5 h-4 w-px bg-slate-200" /> : <div className="mx-1 h-px w-6 bg-slate-200" />;
  }
  if (vertical) {
    return <div className="ml-5 flex flex-col items-center"><div className={`w-px h-4 transition-all duration-500 ${completed ? "bg-indigo-400" : active ? "bg-indigo-300 animate-connector-flow" : "bg-slate-200"}`} /></div>;
  }
  return (
    <div className="mx-1 flex items-center pt-5">
      <div className={`h-0.5 w-6 transition-all duration-500 ${completed ? "bg-indigo-400" : active ? "bg-indigo-300 animate-connector-flow" : "bg-slate-200"}`} />
      <svg className={`h-3 w-3 -ml-0.5 ${completed ? "text-indigo-400" : "text-slate-300"}`} viewBox="0 0 10 10" fill="currentColor" aria-hidden><path d="M2 1l5 4-5 4V1z" /></svg>
    </div>
  );
}

function StatusBadge({ status, aiMode, aiFallbackCount }: { status: PipelineStatus; aiMode: boolean; aiFallbackCount: number }) {
  const configs = {
    IDLE: { label: "Ready", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
    PROCESSING: { label: "Processing", bg: "bg-indigo-100", text: "text-indigo-700", dot: "bg-indigo-500 animate-pulse" },
    AI_PROCESSING: { label: "AI Judge Active", bg: "bg-violet-100", text: "text-violet-700", dot: "bg-violet-500 animate-pulse" },
    COMPLETE: { label: "Complete", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  };
  const c = configs[status];
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
        {c.label}
      </span>
      {status === "COMPLETE" && aiFallbackCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
          AI fallback {'\u2192'} REVIEW
        </span>
      )}
    </div>
  );
}

