"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MetricCard from "@/components/dashboard/MetricCard";

interface HomeStats {
  totalTransactions: number;
  reviewCases: number;
  autoResolutionRate: number;
  learnedCorrections: number;
}

const PIPELINE_STEPS = [
  "Deterministic rules",
  "Local AI judge",
  "Human review",
  "Correction memory",
];

export default function HomePage() {
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
    let reconcileRes = await fetch("/api/reconcile");
    if (!reconcileRes.ok) {
      reconcileRes = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    }
        if (!reconcileRes.ok) throw new Error("reconcile failed");
        const reconciled = (await reconcileRes.json()) as {
          summary: { total: number; byDecision: Record<string, number> };
        };
        let learned = 0;
        try {
          const memoryRes = await fetch("/api/memory?limit=200");
          if (memoryRes.ok) {
            const memory = (await memoryRes.json()) as { count: number };
            learned = memory.count;
          }
        } catch {
          // memory is supplementary for the landing stats
        }
        if (!alive) return;
        const total = reconciled.summary.total;
        const reviewCount = reconciled.summary.byDecision?.REVIEW ?? 0;
        setStats({
          totalTransactions: total,
          reviewCases: reviewCount,
          autoResolutionRate:
            total > 0
              ? Math.round(
                  ((total - reviewCount) / total) * 100
                )
              : 0,
          learnedCorrections: learned,
        });
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Hackathon build · fully local · zero paid APIs
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">
          ADAPT
        </h1>
        <p className="mt-1 text-lg font-semibold text-indigo-700">
          Adaptive AI Finance Controller
        </p>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          ADAPT reconciles financial transactions in two passes. Deterministic
          rules resolve everything they can prove. Only genuinely ambiguous cases
          are escalated to a locally-running AI judge that must justify every
          verdict with confidence and evidence — and anything it cannot support
          goes to a human. Human corrections are remembered and surfaced when
          similar cases appear again.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            Open Dashboard
          </Link>
          <Link
            href="/review"
            className="rounded-md border border-indigo-300 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
          >
            Review queue
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Live status
        </h2>
        {error ? (
          <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            Could not reach the reconciliation API. Make sure the dataset is
            present and refresh.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Total transactions"
              value={stats?.totalTransactions ?? "…"}
              hint="synthetic dataset, INR"
              loading={loading}
            />
            <MetricCard
              label="Reconciliation status"
              value={stats ? `${stats.autoResolutionRate}%` : "…"}
              hint="auto-resolved without humans"
              tone="emerald"
              loading={loading}
            />
            <MetricCard
              label="Review cases"
              value={stats?.reviewCases ?? "…"}
              hint="awaiting human decision"
              tone="amber"
              loading={loading}
            />
            <MetricCard
              label="Learned corrections"
              value={stats?.learnedCorrections ?? "…"}
              hint="patterns stored from human review"
              tone="indigo"
              loading={loading}
            />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          How a case flows
        </h2>
        <ol className="mt-4 flex flex-wrap items-center gap-2 text-sm font-medium">
          {PIPELINE_STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 ring-1 ring-inset ring-indigo-200">
                {step}
              </span>
              {index < PIPELINE_STEPS.length - 1 && (
                <span aria-hidden className="text-slate-400">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate-500">
          Deterministic rules always decide first. The local model only ever
          judges cases it is given evidence for, must cite that evidence, and can
          never invent records. Humans see every escalation and every correction
          they make is remembered.
        </p>
      </section>
    </div>
  );
}