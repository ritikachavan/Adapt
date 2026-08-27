"use client";

import { useCallback, useEffect, useState } from "react";
import DecisionActions from "@/components/review/DecisionActions";
import DecisionReplay from "@/components/audit/DecisionReplay";
import ReviewDetails from "@/components/review/ReviewDetails";
import ReviewQueue from "@/components/review/ReviewQueue";

interface ReviewCase {
  transactionId: string;
  decision: string;
  confidence: number;
  reason: string;
  evidence: Array<{
    field: string;
    expected?: string | number | null;
    actual?: string | number | null;
    detail?: string;
  }>;
  matchedRecordId: string | null;
}

export default function ReviewPage() {
  const [cases, setCases] = useState<ReviewCase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [replayTransactionId, setReplayTransactionId] = useState<string | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/review");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const body = (await res.json()) as { cases: ReviewCase[] };
      setCases(body.cases);
      // Keep the selection only if the case is still pending review.
      setSelectedId((current) =>
        current && body.cases.some((c) => c.transactionId === current)
          ? current
          : null
      );
    } catch {
      setLoadError("Could not load the review queue from the API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = cases.find((c) => c.transactionId === selectedId) ?? null;

  const submitCorrection = useCallback(
    async (
      correctedDecision: string,
      correctionType: string,
      explanation: string
    ) => {
      if (!selected) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const res = await fetch("/api/correct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decisionId: selected.transactionId,
            correctedDecision,
            correctionType,
            explanation,
          }),
        });
        if (!res.ok) {
          const problem = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            problem?.error ?? `Correction failed (${res.status}).`
          );
        }
        const saved = (await res.json()) as { correction: { id: string } };
        setSuccessMessage(
          `Correction ${saved.correction.id} saved — verdict updated to ${correctedDecision}.`
        );
        setSelectedId(null);
        // Keep the replay available for the corrected transaction.
        setReplayTransactionId(selected.transactionId);
        setShowReplay(true);
        // Refresh just the queue data; no full browser reload.
        await load();
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Correction failed."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [selected, load]
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Human review
          </h1>
          <p className="text-sm text-slate-500">
            Ambiguous cases flagged by the deterministic engine. Your
            corrections are recorded and surfaced for future reference.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh queue"}
        </button>
      </header>

      {successMessage && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
          ✓ {successMessage}
        </p>
      )}

      {loadError && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {loadError}{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[340px_1fr]">
        <ReviewQueue
          cases={cases}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setReplayTransactionId(id);
            setShowReplay(false);
            setSuccessMessage(null);
            setSubmitError(null);
          }}
          loading={loading}
        />
        <div className="space-y-4">
          <ReviewDetails item={selected} />
          <DecisionActions
            disabled={!selected}
            submitting={submitting}
            error={submitError}
            onSubmit={submitCorrection}
          />

          {replayTransactionId && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowReplay((v) => !v)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
              >
                {showReplay
                  ? "Hide Decision Replay"
                  : "View Decision Replay"}
              </button>
              {showReplay && (
                <DecisionReplay transactionId={replayTransactionId} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}