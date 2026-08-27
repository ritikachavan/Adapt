// Unit tests for the Groq Challenge Analyst provider.
// NO live Groq API required — HTTP layer is mocked.
import { describe, expect, it } from "vitest";
import { createGrokJudgeProvider } from "../lib/ai/grok";
import type { JudgeCandidateContext } from "../lib/ai/provider";

const CONTEXT: JudgeCandidateContext = {
  paymentId: "pay_42",
  orderId: "ord_42",
  paymentSummary: { id: "pay_42", amount: 12000, currency: "INR" },
  candidateSettlements: [{ id: "stl_9", amount: 11500, fee: 230, settlementDate: "2026-06-03T00:00:00.000Z" }],
  refunds: [],
  ledgerEvidence: [],
  deterministicEvidence: [{ field: "settlement.total", detail: "short by 500 beyond fee" }],
  candidateRecordIds: ["stl_9"],
};

function modelSays(verdict: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(verdict) } }] }),
  };
}

function makeProvider(fetchImpl: (url: string, init: RequestInit) => Promise<unknown>) {
  return createGrokJudgeProvider({
    apiKey: "test-key",
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    timeoutMs: 2_000,
    fetchImpl: fetchImpl as typeof fetch,
  });
}

describe("Groq Challenge Analyst", () => {
  it("returns a valid verdict with structured evidence", async () => {
    const provider = makeProvider(async () => modelSays({
      decision: "REVIEW",
      confidence: 0.6,
      matchedRecordId: null,
      reason: "Settlement amount does not match payment.",
      evidence: [{ field: "settlement.total", expected: 12000, actual: 11500, detail: "short by 500" }],
    }));
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.transactionId).toBe("pay_42");
    expect(result.evidence).toHaveLength(1);
  });

  it("rejects hallucinated matchedRecordId", async () => {
    const provider = makeProvider(async () => modelSays({
      decision: "MATCHED",
      confidence: 0.9,
      matchedRecordId: "stl_FAKE",
      reason: "Matched.",
      evidence: [],
    }));
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
    expect(result.reason).toContain("unavailable or invalid");
  });

  it("returns safe fallback on HTTP error", async () => {
    const provider = makeProvider(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
  });

  it("returns safe fallback on malformed JSON", async () => {
    const provider = makeProvider(async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: "not-json" } }] }),
    }));
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
  });

  it("returns safe fallback when API key is empty", async () => {
    const provider = createGrokJudgeProvider({ apiKey: "" });
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
    expect(provider.name).toBe("groq:unavailable");
  });
});
