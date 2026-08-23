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
});