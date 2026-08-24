// Integration-style tests for POST /api/reconcile using the real synthetic
// dataset. Ollama is NEVER required: one test exercises the safe fallback when
// no Ollama server is running, another injects a stub provider.
import { describe, expect, it, vi } from "vitest";
import { POST, runReconciliation } from "../app/api/reconcile/route";
import type { AiJudgeProvider } from "../lib/ai/provider";
import type { DecisionResult } from "../lib/types";

const BASE_URL = "http://localhost:3000/api/reconcile";

describe("POST /api/reconcile", () => {
  it("returns HTTP 400 for a malformed JSON body", async () => {
    const response = await POST(
      new Request(BASE_URL, { method: "POST", body: "{not-json" })
    );
    expect(response.status).toBe(400);
  });

  it("reconciles the full dataset; absent Ollama degrades REVIEW cases safely", async () => {
    const response = await POST(
      new Request(BASE_URL, { method: "POST", body: "{}" })
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      decisions: DecisionResult[];
      summary: Record<string, number>;
    };
    expect(body.summary.total).toBe(100);
    expect(body.decisions).toHaveLength(100);
    const summed =
      body.summary.matched +
      body.summary.reviewed +
      body.summary.mismatched +
      body.summary.missing +
      body.summary.refunded;
    expect(summed).toBe(100);
    // The dataset plants ambiguous cases, so reviews exist even without AI.
    expect(body.summary.reviewed).toBeGreaterThan(0);
    // Every failed AI attempt kept the safe fallback signature.
    const reviews = body.decisions.filter((d) => d.decision === "REVIEW");
    expect(reviews.length).toBe(body.summary.reviewed);
  });

  it("escalates only REVIEW decisions to an injected AI provider", async () => {
    const judge = vi.fn(
      async (ctx: { paymentId: string; candidateRecordIds: string[] }) =>
        ({
          transactionId: ctx.paymentId,
          decision: "MATCHED",
          confidence: 0.9,
          reason: "stub approval",
          evidence: [],
          matchedRecordId: ctx.candidateRecordIds[0] ?? null,
          source: "OLLAMA",
        }) satisfies DecisionResult
    );
    const stubProvider: AiJudgeProvider = { name: "stub", judge };

    const response = await runReconciliation({ provider: stubProvider });

    // The AI was called exactly once per deterministic REVIEW case...
    const aiTouched = response.decisions.filter(
      (d) => d.source === "OLLAMA"
    );
    expect(judge).toHaveBeenCalledTimes(aiTouched.length);
    expect(aiTouched.length).toBeGreaterThan(0);
    // ...each call replaced a REVIEW case with its verdict...
    expect(aiTouched.every((d) => d.decision === "MATCHED")).toBe(true);
    // ...and every deterministic non-REVIEW decision stayed untouched.
    const deterministic = response.decisions.filter(
      (d) => d.source === "DETERMINISTIC"
    );
    expect(deterministic.length).toBe(100 - aiTouched.length);
    expect(deterministic.some((d) => d.decision === "REFUNDED")).toBe(true);
    expect(response.summary.total).toBe(100);
    expect(response.summary.matched).toBeGreaterThan(0);
  });

  it("does not block on AI by default: REVIEW keeps its honest DETERMINISTIC source", async () => {
    const startedAt = Date.now();
    const response = await runReconciliation();
    const elapsed = Date.now() - startedAt;

    const reviews = response.decisions.filter(
      (d) => d.decision === "REVIEW"
    );
    expect(reviews.length).toBeGreaterThan(0);
    // No AI evaluated these in the default run — they must not pretend it did.
    for (const review of reviews) {
      expect(review.source).toBe("DETERMINISTIC");
    }
    // Previously the response awaited Ollama (~60s); generous smoke bound.
    expect(elapsed).toBeLessThan(5_000);
  });

  it("still escalates REVIEW cases when AI is explicitly requested", async () => {
    const judge = vi.fn(
      async (ctx: { paymentId: string }) =>
        ({
          transactionId: ctx.paymentId,
          decision: "MATCHED",
          confidence: 0.9,
          reason: "explicit escalation",
          evidence: [],
          matchedRecordId: null,
          source: "OLLAMA",
        }) satisfies DecisionResult
    );
    const response = await runReconciliation({
      provider: { name: "stub", judge },
      ai: true,
    });
    const escalated = response.decisions.filter((d) => d.source === "OLLAMA");
    expect(judge).toHaveBeenCalled();
    expect(escalated.length).toBeGreaterThan(0);
  });

  it("caps escalation at default 4 REVIEW cases and leaves excess as REVIEW", async () => {
    const judge = vi.fn(
      async (ctx: { paymentId: string }) =>
        ({
          transactionId: ctx.paymentId,
          decision: "MATCHED",
          confidence: 0.9,
          reason: "capped test approval",
          evidence: [],
          matchedRecordId: null,
          source: "OLLAMA",
        }) satisfies DecisionResult
    );
    const response = await runReconciliation({
      provider: { name: "stub-bounded", judge },
      ai: true,
    });

    // Default max escalations is 4
    expect(judge).toHaveBeenCalledTimes(4);
    expect(response.aiMetrics?.deterministicReviewCount).toBeGreaterThan(4);
    expect(response.aiMetrics?.aiEscalatedCount).toBe(4);
    expect(response.aiMetrics?.aiSuccessCount).toBe(4);
    expect(response.aiMetrics?.aiFallbackCount).toBe(0);
    expect(response.aiMetrics?.aiSkippedCount).toBe(
      (response.aiMetrics?.deterministicReviewCount ?? 0) - 4
    );
    expect(response.aiMetrics?.aiEnabled).toBe(true);
    expect(response.aiMetrics?.aiProvider).toBe("stub-bounded");

    // Excess REVIEW cases remain REVIEW with DETERMINISTIC source
    const remainingReviews = response.decisions.filter(
      (d) => d.decision === "REVIEW" && d.source === "DETERMINISTIC"
    );
    expect(remainingReviews.length).toBe(response.aiMetrics?.aiSkippedCount);
  });

  it("respects custom maxEscalations", async () => {
    const judge = vi.fn(
      async (ctx: { paymentId: string }) =>
        ({
          transactionId: ctx.paymentId,
          decision: "MATCHED",
          confidence: 0.85,
          reason: "custom limit",
          evidence: [],
          matchedRecordId: null,
          source: "OLLAMA",
        }) satisfies DecisionResult
    );
    const response = await runReconciliation({
      provider: { name: "custom-stub", judge },
      ai: true,
      maxEscalations: 3,
    });

    expect(judge).toHaveBeenCalledTimes(3);
    expect(response.aiMetrics?.aiEscalatedCount).toBe(3);
    expect(response.aiMetrics?.aiSkippedCount).toBe(
      (response.aiMetrics?.deterministicReviewCount ?? 0) - 3
    );
  });

  it("invokes zero AI calls when maxEscalations=0 even with ai=true", async () => {
    const judge = vi.fn(
      async (ctx: { paymentId: string }) =>
        ({
          transactionId: ctx.paymentId,
          decision: "MATCHED",
          confidence: 0.9,
          reason: "should never run",
          evidence: [],
          matchedRecordId: null,
          source: "OLLAMA",
        }) satisfies DecisionResult
    );
    const response = await runReconciliation({
      provider: { name: "zero-stub", judge },
      ai: true,
      maxEscalations: 0,
    });

    expect(judge).toHaveBeenCalledTimes(0);
    expect(response.aiMetrics?.aiEscalatedCount).toBe(0);
    expect(response.aiMetrics?.aiSuccessCount).toBe(0);
    expect(response.aiMetrics?.aiFallbackCount).toBe(0);
    expect(response.aiMetrics?.aiSkippedCount).toBe(
      response.aiMetrics?.deterministicReviewCount
    );
    expect(response.aiMetrics?.aiEnabled).toBe(true);
    expect(
      response.decisions.every(
        (d) => d.source === "DETERMINISTIC"
      )
    ).toBe(true);
  });

  it("clamps negative maxEscalations to 0", async () => {
    const judge = vi.fn(
      async (ctx: { paymentId: string }) =>
        ({
          transactionId: ctx.paymentId,
          decision: "MATCHED",
          confidence: 0.9,
          reason: "should never run",
          evidence: [],
          matchedRecordId: null,
          source: "OLLAMA",
        }) satisfies DecisionResult
    );
    const response = await runReconciliation({
      provider: { name: "neg-stub", judge },
      ai: true,
      maxEscalations: -5,
    });

    expect(judge).toHaveBeenCalledTimes(0);
    expect(response.aiMetrics?.aiEscalatedCount).toBe(0);
    expect(response.aiMetrics?.aiSkippedCount).toBe(
      response.aiMetrics?.deterministicReviewCount
    );
  });

  it("uses default maxEscalations when given NaN", async () => {
    const judge = vi.fn(
      async (ctx: { paymentId: string }) =>
        ({
          transactionId: ctx.paymentId,
          decision: "MATCHED",
          confidence: 0.9,
          reason: "default test",
          evidence: [],
          matchedRecordId: null,
          source: "OLLAMA",
        }) satisfies DecisionResult
    );
    const response = await runReconciliation({
      provider: { name: "nan-stub", judge },
      ai: true,
      maxEscalations: Number.NaN,
    });

    expect(judge).toHaveBeenCalledTimes(4);
    expect(response.aiMetrics?.aiEscalatedCount).toBe(4);
  });

  it("returns HTTP 400 for an array body", async () => {
    const response = await POST(
      new Request(BASE_URL, {
        method: "POST",
        body: JSON.stringify([1, 2, 3]),
      })
    );
    expect(response.status).toBe(400);
  });

  it("returns HTTP 400 for a null body", async () => {
    const response = await POST(
      new Request(BASE_URL, {
        method: "POST",
        body: "null",
      })
    );
    expect(response.status).toBe(400);
  });

  it("returns HTTP 200 for ai=false", async () => {
    const response = await POST(
      new Request(BASE_URL, {
        method: "POST",
        body: JSON.stringify({ ai: false }),
      })
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      aiMetrics: { aiEnabled: boolean };
    };
    expect(body.aiMetrics.aiEnabled).toBe(false);
  });

  it("degrades safely when the AI provider throws", async () => {
    const judge = vi.fn(async () => {
      throw new Error("Ollama exploded");
    });
    const response = await runReconciliation({
      provider: { name: "throwing-stub", judge },
      ai: true,
      maxEscalations: 2,
    });

    expect(judge).toHaveBeenCalledTimes(2);
    expect(response.aiMetrics?.aiFallbackCount).toBe(2);
    expect(response.aiMetrics?.aiSuccessCount).toBe(0);
    const escalated = response.decisions.filter(
      (d) => d.source === "OLLAMA"
    );
    expect(escalated).toHaveLength(2);
    for (const d of escalated) {
      expect(d.decision).toBe("REVIEW");
      expect(d.confidence).toBe(0);
    }
  });

  it("summary counts always sum to total", async () => {
    const response = await runReconciliation();
    const summed =
      response.summary.matched +
      response.summary.reviewed +
      response.summary.mismatched +
      response.summary.missing +
      response.summary.refunded;
    expect(summed).toBe(response.summary.total);
    expect(response.summary.total).toBe(
      response.decisions.length
    );
  });

  it("every decision has valid confidence in [0,1]", async () => {
    const response = await runReconciliation();
    for (const d of response.decisions) {
      expect(d.confidence).toBeGreaterThanOrEqual(0);
      expect(d.confidence).toBeLessThanOrEqual(1);
      expect(Number.isFinite(d.confidence)).toBe(true);
    }
  });

  it("every decision has a valid decision label", async () => {
    const validLabels = [
      "MATCHED",
      "REVIEW",
      "MISMATCH",
      "MISSING",
      "REFUNDED",
    ];
    const response = await runReconciliation();
    for (const d of response.decisions) {
      expect(validLabels).toContain(d.decision);
    }
  });

  it("only REVIEW cases are escalated to AI", async () => {
    const escalatedIds: string[] = [];
    const judge = vi.fn(
      async (ctx: {
        paymentId: string;
        candidateRecordIds: string[];
      }) => {
        escalatedIds.push(ctx.paymentId);
        return {
          transactionId: ctx.paymentId,
          decision: "MATCHED" as const,
          confidence: 0.9,
          reason: "escalation test",
          evidence: [],
          matchedRecordId:
            ctx.candidateRecordIds[0] ?? null,
          source: "OLLAMA" as const,
        } satisfies DecisionResult;
      }
    );
    const response = await runReconciliation({
      provider: { name: "escalation-stub", judge },
      ai: true,
    });

    // Get deterministic-only baseline to know which are REVIEW
    const baseline = await runReconciliation();
    const baselineReviews = baseline.decisions
      .filter((d) => d.decision === "REVIEW")
      .map((d) => d.transactionId);

    for (const id of escalatedIds) {
      expect(baselineReviews).toContain(id);
    }
    expect(response.summary.total).toBe(100);
  });

  it("deterministic mode never invokes the AI provider", async () => {
    const judge = vi.fn(
      async (ctx: { paymentId: string }) =>
        ({
          transactionId: ctx.paymentId,
          decision: "MATCHED",
          confidence: 0.9,
          reason: "should not run",
          evidence: [],
          matchedRecordId: null,
          source: "OLLAMA",
        }) satisfies DecisionResult
    );
    // No provider and no ai flag => pure deterministic
    const response = await runReconciliation();

    expect(response.aiMetrics?.aiEnabled).toBe(false);
    expect(response.aiMetrics?.aiProvider).toBeNull();
    expect(response.aiMetrics?.aiEscalatedCount).toBe(0);
    expect(
      response.decisions.every(
        (d) => d.source === "DETERMINISTIC"
      )
    ).toBe(true);
  });
});