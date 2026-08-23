"use client";

import CorrectionMemory from "@/components/learning/CorrectionMemory";
import MetricCard from "@/components/dashboard/MetricCard";
import type { LearnedPatternItem } from "@/components/learning/LearnedPattern";
import { useEffect, useState } from "react";

export default function LearningPage() {
  const [corrections, setCorrections] = useState<LearnedPatternItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/memory?limit=100");
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body = (await res.json()) as { corrections: LearnedPatternItem[] };
        if (alive) setCorrections(body.corrections);
      } catch {
        if (alive) setError("Could not load correction memory.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Learning
        </h1>
        <p className="text-sm text-slate-500">
          What ADAPT has learned from human corrections so far.
        </p>
      </header>

      <MetricCard
        label="Learned corrections"
        value={loading ? "…" : corrections.length}
        hint="stored patterns that guide future reviews"
        tone="indigo"
        loading={loading}
      />

      <CorrectionMemory
        items={corrections}
        loading={loading}
        error={error}
      />
    </div>
  );
}