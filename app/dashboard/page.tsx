"use client";

import { useCallback, useEffect, useState } from "react";
import HeroHeader from "@/components/dashboard/HeroHeader";
import KPICards from "@/components/dashboard/KPICards";
import HealthScore from "@/components/dashboard/HealthScore";
import TransactionTable from "@/components/dashboard/TransactionTable";
import type { TransactionRow } from "@/components/dashboard/TransactionTable";
import DashboardReviewQueue from "@/components/dashboard/DashboardReviewQueue";
import type { ReviewItem } from "@/components/dashboard/DashboardReviewQueue";
import AIPanel from "@/components/dashboard/AIPanel";
import AuditIntelligence from "@/components/dashboard/AuditIntelligence";
import ReconciliationPipeline from "@/components/dashboard/ReconciliationPipeline";
import type { PipelineStatus, PipelineData } from "@/components/dashboard/ReconciliationPipeline";
import TransactionDrawer from "@/components/dashboard/TransactionDrawer";
import type { DrawerDecision } from "@/components/dashboard/TransactionDrawer";
import type { ReconciliationSummary } from "@/components/dashboard/ReconciliationOverview";

interface AiMetrics {
  deterministicReviewCount: number;
  aiEscalatedCount: number;
  aiSuccessCount: number;
  aiFallbackCount: number;
  aiSkippedCount: number;
  aiEnabled: boolean;
  aiProvider: string | null;
}

interface ReconcileResponse {
  decisions: TransactionRow[];
  summary: ReconciliationSummary;
  aiMetrics: AiMetrics;
}

export default function DashboardPage() {
  const [data, setData] = useState<ReconcileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const [drawerData, setDrawerData] = useState<DrawerDecision | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>("IDLE");
  const [tableFilter, setTableFilter] = useState<string | null>(null);

  const run = useCallback(async (withAI: boolean) => {
    setLoading(true);
    setError(null);
    setAiMode(withAI);
    setPipelineStatus(withAI ? "AI_PROCESSING" : "PROCESSING");
    try {
      const body = withAI ? { ai: true, maxEscalations: 4 } : {};
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData((await res.json()) as ReconcileResponse);
      setPipelineStatus("COMPLETE");
    } catch {
      setError("Could not reach the reconciliation API.");
      setPipelineStatus("IDLE");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void run(false); }, [run]);

  const openDrawer = useCallback((item: TransactionRow | ReviewItem) => {
    setDrawerData(item as DrawerDecision);
  }, []);

  const handleStageClick = useCallback((filter: string) => {
    setTableFilter(filter);
    const el = document.getElementById("transaction-table");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleFilterApplied = useCallback(() => {
    setTableFilter(null);
  }, []);

  const pipelineData: PipelineData | null = data ? {
    total: data.summary.total,
    matched: data.summary.matched,
    reviewed: data.summary.reviewed,
    mismatched: data.summary.mismatched,
    missing: data.summary.missing,
    refunded: data.summary.refunded,
    aiEscalatedCount: data.aiMetrics.aiEscalatedCount,
    aiSuccessCount: data.aiMetrics.aiSuccessCount,
    aiFallbackCount: data.aiMetrics.aiFallbackCount,
    aiEnabled: data.aiMetrics.aiEnabled,
  } : null;

  if (error) {
    return (
      <div className="space-y-6">
        <HeroHeader onRunDeterministic={() => void run(false)} onRunAI={() => void run(true)} loading={loading} aiMode={aiMode} hasData={false} />
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 flex items-center gap-3">
          <p className="flex-1 text-sm font-medium text-rose-800">{error}</p>
          <button type="button" onClick={() => void run(aiMode)} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Retry</button>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <HeroHeader onRunDeterministic={() => void run(false)} onRunAI={() => void run(true)} loading={true} aiMode={false} hasData={false} />
        <ReconciliationPipeline status={pipelineStatus} data={null} aiMode={aiMode} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (<div key={i} className="h-24 animate-pulse rounded-xl bg-white shadow-sm" />))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-white shadow-sm" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <HeroHeader onRunDeterministic={() => void run(false)} onRunAI={() => void run(true)} loading={loading} aiMode={aiMode} hasData={true} />
      <ReconciliationPipeline status={pipelineStatus} data={pipelineData} aiMode={aiMode} onStageClick={handleStageClick} />
      <KPICards summary={data.summary} aiEscalatedCount={data.aiMetrics.aiEscalatedCount} />
      <AuditIntelligence summary={data.summary} aiMetrics={data.aiMetrics} decisions={data.decisions} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><HealthScore summary={data.summary} /></div>
        <AIPanel aiEnabled={data.aiMetrics.aiEnabled} aiProvider={data.aiMetrics.aiProvider} deterministicReviewCount={data.aiMetrics.deterministicReviewCount} aiEscalatedCount={data.aiMetrics.aiEscalatedCount} aiSuccessCount={data.aiMetrics.aiSuccessCount} aiFallbackCount={data.aiMetrics.aiFallbackCount} aiSkippedCount={data.aiMetrics.aiSkippedCount} />
      </div>
      <DashboardReviewQueue decisions={data.decisions} onItemClick={openDrawer} />
      <div id="transaction-table">
        <TransactionTable decisions={data.decisions} onRowClick={openDrawer} activeFilter={tableFilter} onFilterApplied={handleFilterApplied} />
      </div>
      <TransactionDrawer decision={drawerData} onClose={() => setDrawerData(null)} />
      {loading && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm">
          <div className="rounded-xl bg-white p-6 shadow-xl flex items-center gap-3">
            <svg className="h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium text-slate-800">{aiMode ? "Running AI reconciliation\u2026" : "Running reconciliation\u2026"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
