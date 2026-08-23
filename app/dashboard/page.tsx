"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ExceptionSummary, {
  type ExceptionDecision,
} from "@/components/dashboard/ExceptionSummary";
import LearningProgress from "@/components/dashboard/LearningProgress";
import MetricCard from "@/components/dashboard/MetricCard";
import ReconciliationOverview, {
  type ReconciliationSummary,
} from "@/components/dashboard/ReconciliationOverview";

interface Decision {
  transactionId: string;
  decision: string;
  confidence: number;
  reason: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [corrections, setCorrections] = useState<
    { correctionType: string; correctedDecision: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rec = await postJson<{
        decisions: Decision[];
        summary: ReconciliationSummary;
      }>("/api/reconcile", {});
      let recentCorrections: {
        correctionType: string;
        correctedDecision: string;
      }[] = [];
      try {
        const mem = await getJson<{
          corrections: { correctionType: string; correctedDecision: string }[];
        }>("/api/memory?limit=100");
        recentCorrections = mem.corrections;
      } catch {
        // memory is supplementary; reconciliation data still renders
      }
      setSummary(rec.summary);
      setDecisions(rec.decisions);
      setCorrections(recentCorrections);
    } catch {
      setError("Could not load reconciliation data from the API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = summary?.total ?? 0;
  const reviewRate =
    summary && total > 0 ? Math.round((summary.reviewed / total) * 100) : 0;
  const autoRate = summary && total > 0 ? 100 - reviewRate : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Live deterministic + AI-assisted reconciliation over the synthetic
            dataset.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      ) : null}
      {summary ? (
        <>
          <ReconciliationOverview summary={summary} />

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricCard
              label="Review rate"
              value={`${reviewRate}%`}
              hint="cases escalated to humans / the AI judge"
              tone="amber"
            />
            <MetricCard
              label="Auto-resolution rate"
              value={`${autoRate}%`}
              hint="resolved deterministically end-to-end"
              tone="emerald"
            />
          </section>

          <ExceptionSummary decisions={decisions} />

          <LearningProgress corrections={corrections} />

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Recent review cases
              </h2>
              <Link
                href="/review"
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
              >
                Open review queue →
              </Link>
            </div>
            {(() => {
              const recent = decisions
                .filter((d) => d.decision === "REVIEW")
                .slice(0, 5);
              if (recent.length === 0)
                return (
                  <p className="mt-3 text-sm text-slate-500">
                    No cases are waiting for review.
                  </p>
                );
              return (
                <ul className="mt-3 space-y-2">
                  {recent.map((d) => (
                    <li
                      key={d.transactionId}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {d.transactionId}
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-slate-600">
                          {Math.round(d.confidence * 100)}% confidence
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-600">
                        {d.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </section>
        </>
      ) : null}
    </div>
  );
}