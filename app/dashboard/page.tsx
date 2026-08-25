"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HeroHeader from "@/components/dashboard/HeroHeader";
import KPICards from "@/components/dashboard/KPICards";
import HealthScore from "@/components/dashboard/HealthScore";
import TransactionTable from "@/components/dashboard/TransactionTable";
import type { TransactionRow } from "@/components/dashboard/TransactionTable";
import DashboardReviewQueue from "@/components/dashboard/DashboardReviewQueue";
import type { ReviewItem } from "@/components/dashboard/DashboardReviewQueue";
import AIPanel from "@/components/dashboard/AIPanel";
import AuditIntelligence from "@/components/dashboard/AuditIntelligence";
import ReconciliationOutcomeChart from "@/components/dashboard/ReconciliationOutcomeChart";
import ReconciliationPipeline from "@/components/dashboard/ReconciliationPipeline";
import type { PipelineStatus, PipelineData } from "@/components/dashboard/ReconciliationPipeline";
import TransactionDrawer from "@/components/dashboard/TransactionDrawer";
import type { DrawerDecision } from "@/components/dashboard/TransactionDrawer";
import AskAdapt from "@/components/dashboard/AskAdapt";
import { useReconciliation } from "@/lib/reconciliation-context";
import type { ReconciliationResult } from "@/lib/reconciliation-context";

export default function DashboardPage() {
  const { data, status, aiMode, error, setData, setStatus, setAiMode, setError } = useReconciliation();
  const [drawerData, setDrawerData] = useState<DrawerDecision | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>("IDLE");
  const [tableFilter, setTableFilter] = useState<string | null>(null);
  const initRef = useRef(false);

  // One-time init: try to restore from server. Runs exactly once per session.
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (data) return;

    fetch("/api/reconcile")
      .then((res) => {
        if (res.ok) return res.json();
        setStatus("IDLE");
        return null;
      })
      .then((result) => {
        if (result) {
          setData(result as ReconciliationResult);
          if ((result as ReconciliationResult).aiMetrics?.aiEscalatedCount > 0) setAiMode(true);
          setStatus("HAS_RESULT");
        }
      })
      .catch(() => { setStatus("IDLE"); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(async (withAI: boolean) => {
    setStatus("LOADING"); setError(null); setAiMode(withAI);
    setPipelineStatus(withAI ? "AI_PROCESSING" : "PROCESSING");
    try {
      const body = withAI ? { ai: true, maxEscalations: 4 } : {};
      const res = await fetch("/api/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData((await res.json()) as ReconciliationResult);
      setStatus("HAS_RESULT"); setPipelineStatus("COMPLETE");
    } catch {
      setError("Could not reach the reconciliation API."); setStatus("ERROR"); setPipelineStatus("IDLE");
    }
  }, [setStatus, setError, setAiMode, setData]);

  const openDrawer = useCallback((item: TransactionRow | ReviewItem) => { setDrawerData(item as DrawerDecision); }, []);
  const handleStageClick = useCallback((filter: string) => { setTableFilter(filter); document.getElementById("transaction-table")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);
  const handleFilterApplied = useCallback(() => { setTableFilter(null); }, []);

  const pipelineData: PipelineData | null = data ? { total: data.summary.total, matched: data.summary.matched, reviewed: data.summary.reviewed, mismatched: data.summary.mismatched, missing: data.summary.missing, refunded: data.summary.refunded, aiEscalatedCount: data.aiMetrics.aiEscalatedCount, aiSuccessCount: data.aiMetrics.aiSuccessCount, aiFallbackCount: data.aiMetrics.aiFallbackCount, aiEnabled: data.aiMetrics.aiEnabled, anomalyCount: data.decisions.filter((d) => d.anomaly?.isAnomalous).length } : null;

  // ERROR state
  if (status === "ERROR" && !data) {
    return (
      <div className="space-y-6">
        <HeroHeader onRunDeterministic={() => void run(false)} onRunAI={() => void run(true)} loading={false} aiMode={aiMode} hasData={false} />
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-rose-100">
              <svg className="h-4 w-4 text-rose-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
            </div>
            <div className="flex-1"><p className="text-sm font-semibold text-rose-800">Connection Error</p><p className="mt-1 text-sm text-rose-700">{error}</p></div>
            <button type="button" onClick={() => void run(aiMode)} className="rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  // IDLE or LOADING without data — show skeleton + prompt
  if (!data) {
    return (
      <div className="space-y-6">
        <HeroHeader onRunDeterministic={() => void run(false)} onRunAI={() => void run(true)} loading={status === "LOADING"} aiMode={aiMode} hasData={false} />
        {status === "LOADING" ? (
          <>
            <ReconciliationPipeline status={pipelineStatus} data={null} aiMode={aiMode} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{Array.from({ length: 2 }, (_, i) => (<div key={i} className="h-28 animate-pulse rounded-xl bg-white shadow-sm" />))}</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => (<div key={i} className="h-20 animate-pulse rounded-xl bg-white shadow-sm" />))}</div>
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
              <svg className="h-8 w-8 text-indigo-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">No Reconciliation Run</h2>
            <p className="mt-2 text-sm text-slate-500">Click <strong>Run Reconciliation</strong> above to analyze your financial data.</p>
          </div>
        )}
      </div>
    );
  }

  // HAS_RESULT (or LOADING with existing data)
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end mb-2"><AskAdapt /></div>
      <HeroHeader onRunDeterministic={() => void run(false)} onRunAI={() => void run(true)} loading={status === "LOADING"} aiMode={aiMode} hasData={true} aiProvider={data.aiMetrics.aiProvider} aiSuccessCount={data.aiMetrics.aiSuccessCount} />
      <ReconciliationPipeline status={pipelineStatus} data={pipelineData} aiMode={aiMode} onStageClick={handleStageClick} />
      <KPICards summary={data.summary} aiEscalatedCount={data.aiMetrics.aiEscalatedCount} />
      <ReconciliationOutcomeChart summary={data.summary} />
      <AuditIntelligence summary={data.summary} aiMetrics={data.aiMetrics} decisions={data.decisions} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><HealthScore summary={data.summary} /></div>
        <AIPanel aiEnabled={data.aiMetrics.aiEnabled} aiProvider={data.aiMetrics.aiProvider} deterministicReviewCount={data.aiMetrics.deterministicReviewCount} aiEscalatedCount={data.aiMetrics.aiEscalatedCount} aiSuccessCount={data.aiMetrics.aiSuccessCount} aiFallbackCount={data.aiMetrics.aiFallbackCount} aiSkippedCount={data.aiMetrics.aiSkippedCount} />
      </div>
      <DashboardReviewQueue decisions={data.decisions} onItemClick={openDrawer} />
      <div id="transaction-table"><TransactionTable decisions={data.decisions} onRowClick={openDrawer} activeFilter={tableFilter} onFilterApplied={handleFilterApplied} /></div>
      <TransactionDrawer decision={drawerData} onClose={() => setDrawerData(null)} />
    </div>
  );
}
