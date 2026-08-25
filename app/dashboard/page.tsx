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
import AskAdapt from "@/components/dashboard/AskAdapt";
import type { ReconciliationSummary} from "@/components/dashboard/ReconciliationOverview";

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
      setError("Could not reach the reconciliation API. Ensure the server is running and try again.");
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
    document.getElementById("transaction-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleFilterApplied = useCallback(() => { setTableFilter(null); }, []);

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
    anomalyCount: data.decisions.filter((d) => d.anomaly?.isAnomalous).length,
  } : null;

  if (error) {
    return (
      <div className="space-y-6">
        <HeroHeader onRunDeterministic={() => void run(false)} onRunAI={() => void run(true)} loading={loading} aiMode={aiMode} hasData={false} />
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-rose-100">
              <svg className="h-4 w-4 text-rose-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-800">Connection Error</p>
              <p className="mt-1 text-sm text-rose-700">{error}</p>
            </div>
            <button type="button" onClick={() => void run(aiMode)}
              className="rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <HeroHeader onRunDeterministic={() => void run(false)} onRunAI={() => void run(true)} loading={true} aiMode={aiMode} hasData={false} />
        <ReconciliationPipeline status={pipelineStatus} data={null} aiMode={aiMode} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (<div key={i} className="h-28 animate-pulse rounded-xl bg-white shadow-sm" />))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (<div key={i} className="h-20 animate-pulse rounded-xl bg-white shadow-sm" />))}
        </div>
        <div className="h-48 animate-pulse rounded-xl bg-white shadow-sm" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end mb-2"><AskAdapt /></div>
      <HeroHeader onRunDeterministic={() => void run(false)} onRunAI={() => void run(true)} loading={loading} aiMode={aiMode} hasData={true} aiProvider={data.aiMetrics.aiProvider} aiSuccessCount={data.aiMetrics.aiSuccessCount} />
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

    </div>
  );
}
