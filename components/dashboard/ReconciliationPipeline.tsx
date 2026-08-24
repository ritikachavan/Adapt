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
    if (status === "IDLE" || status === "COMPLETE") {
      setActiveStage(0);
      return;
    }
    setActiveStage(1);
    const stages = aiMode ? 5 : 4;
    const timers: NodeJS.Timeout[] = [];
    for (let i = 2; i <= stages; i++) {
      timers.push(setTimeout(() => setActiveStage(i), STAGE_DURATION * (i - 1)));
    }
    return () => timers.forEach(clearTimeout);
  }, [status, aiMode]);

  const exceptions = data ? data.reviewed + data.mismatched + data.missing + data.refunded : 0;
  const humanReview = data ? data.reviewed - data.aiSuccessCount : 0;

  const stages = [
    {
      id: "transactions",
      title: "Transactions",
      count: data?.total ?? 0,
      desc: "Financial records to reconcile",
      color: "bg-slate-600",
      ring: "ring-slate-300",
      text: "text-slate-700",
      clickable: false,
      filter: null,
    },
    {
      id: "deterministic",
      title: "Deterministic",
      count: data ? data.matched + data.reviewed + data.mismatched + data.missing + data.refunded : 0,
      desc: "Rule-based matching engine",
      color: "bg-indigo-600",
      ring: "ring-indigo-300",
      text: "text-indigo-700",
      clickable: false,
      filter: null,
    },
    {
      id: "matched",
      title: "Matched",
      count: data?.matched ?? 0,
      desc: "Auto-resolved transactions",
      color: "bg-emerald-600",
      ring: "ring-emerald-300",
      text: "text-emerald-700",
      clickable: true,
      filter: "MATCHED",
    },
    {
      id: "exceptions",
      title: "Exceptions",
      count: exceptions,
      desc: "Require attention",
      color: "bg-amber-600",
      ring: "ring-amber-300",
      text: "text-amber-700",
      clickable: true,
      filter: "EXCEPTIONS",
    },
    {
      id: "ai-judge",
      title: "AI Judge",
      count: data?.aiEscalatedCount ?? 0,
      desc: data?.aiEnabled ? `${data.aiSuccessCount} success, ${data.aiFallbackCount} fallback` : "Not invoked",
      color: "bg-violet-600",
      ring: "ring-violet-300",
      text: "text-violet-700",
      clickable: false,
      filter: "OLLAMA",
    },
    {
      id: "human-review",
      title: "Human Review",
      count: Math.max(0, humanReview),
      desc: "Awaiting human decision",
      color: "bg-rose-600",
      ring: "ring-rose-300",
      text: "text-rose-700",
      clickable: true,
      filter: "REVIEW",
    },
  ];

  const isStageActive = (index: number) => {
    if (status === "COMPLETE") return false;
    if (status === "IDLE") return false;
    return index === activeStage;
  };

  const isStageCompleted = (index: number) => {
    if (status === "COMPLETE") return true;
    if (status === "IDLE") return false;
    return index < activeStage;
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Reconciliation pipeline">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Live Pipeline</h2>
        <StatusBadge status={status} aiMode={aiMode} aiFallbackCount={data?.aiFallbackCount ?? 0} />
      </div>

      <div className="p-5">
        <div className="flex flex-col gap-0 md:flex-row md:items-start md:gap-0">
          {stages.map((stage, i) => (
            <div key={stage.id} className="flex flex-col md:flex-row md:items-start">
              <PipelineStage
                stage={stage}
                index={i}
                isActive={isStageActive(i)}
                isCompleted={isStageCompleted(i)}
                status={status}
                onStageClick={onStageClick}
              />
              {i < stages.length - 1 && (
                <Connector isActive={isStageActive(i)} isCompleted={isStageCompleted(i)} status={status} vertical={false} />
              )}
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
  isActive: boolean;
  isCompleted: boolean;
  status: PipelineStatus;
  onStageClick?: (filter: string) => void;
}

function PipelineStage({ stage, index, isActive, isCompleted, status, onStageClick }: StageProps) {
  const showCount = status === "COMPLETE" || isCompleted;
  const Wrapper = stage.clickable && status === "COMPLETE" ? "button" : "div";
  const wrapperProps = stage.clickable && status === "COMPLETE" && stage.filter && onStageClick
    ? { type: "button" as const, onClick: () => onStageClick(stage.filter!), className: "group cursor-pointer", "aria-label": `Filter by ${stage.title}` }
    : { className: "group" };

  return (
    <Wrapper {...wrapperProps}>
      <div className={`flex flex-col items-center md:min-w-[120px] ${isActive ? "animate-stage-pulse" : ""}`}>
        <div className={`relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-300 ${
          isActive
            ? `${stage.color} border-transparent text-white shadow-lg ${stage.ring} ring-4`
            : isCompleted
              ? `${stage.color} border-transparent text-white`
              : "border-slate-200 bg-white text-slate-400"
        }`}>
          {isCompleted && !isActive ? (
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          ) : (
            <span className="text-sm font-bold">{index + 1}</span>
          )}
          {isActive && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500" />
            </span>
          )}
        </div>
        <p className={`mt-2 text-center text-xs font-semibold ${isActive ? stage.text : isCompleted ? "text-slate-700" : "text-slate-400"}`}>
          {stage.title}
        </p>
        {showCount && (
          <p className={`mt-0.5 text-center text-lg font-bold tabular-nums ${isActive ? stage.text : isCompleted ? "text-slate-800" : "text-slate-300"}`}>
            {stage.count}
          </p>
        )}
        {status === "COMPLETE" && (
          <p className="mt-0.5 max-w-[100px] text-center text-[10px] leading-tight text-slate-500">{stage.desc}</p>
        )}
        {stage.clickable && status === "COMPLETE" && (
          <span className={`mt-1 text-[10px] font-medium ${stage.text} opacity-0 transition-opacity group-hover:opacity-100`}>
            Click to filter
          </span>
        )}
      </div>
    </Wrapper>
  );
}

function Connector({ isActive, isCompleted, status }: { isActive: boolean; isCompleted: boolean; status: PipelineStatus; vertical: boolean }) {
  if (status === "IDLE") {
    return <div className="mx-2 hidden h-px w-8 bg-slate-200 md:block" />;
  }
  return (
    <div className="mx-2 hidden items-center md:flex">
      <div className={`h-0.5 w-8 transition-all duration-500 ${
        isCompleted ? "bg-indigo-400" : isActive ? "bg-indigo-300 animate-connector-flow" : "bg-slate-200"
      }`} />
      <svg className={`h-3 w-3 -ml-0.5 ${isCompleted ? "text-indigo-400" : "text-slate-300"}`} viewBox="0 0 10 10" fill="currentColor" aria-hidden>
        <path d="M2 1l5 4-5 4V1z" />
      </svg>
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
  const config = configs[status];
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.bg} ${config.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
        {config.label}
      </span>
      {status === "COMPLETE" && aiFallbackCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
          AI fallback \u2192 REVIEW
        </span>
      )}
    </div>
  );
}
