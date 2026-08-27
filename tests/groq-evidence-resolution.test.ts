// Regression tests for Groq evidence resolution from source records.
import { describe, expect, it } from "vitest";
import { createGrokJudgeProvider } from "../lib/ai/grok";
import type { JudgeCandidateContext } from "../lib/ai/provider";

const CONTEXT: JudgeCandidateContext = {
  paymentId: "pay_0006",
  orderId: "ord_0006",
  paymentSummary: { id: "pay_0006", orderId: "ord_0006", amount: 24999, status: "SETTLED" },
  candidateSettlements: [{ id: "stl_0006", amount: 24999, fee: 0, settlementDate: "2026-06-05T19:34:00.000Z" }],
  refunds: [],
  ledgerEvidence: [],
  deterministicEvidence: [],
  candidateRecordIds: ["stl_0006"],
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
    model: "qwen/qwen3.8-27b",
    baseUrl: "https://api.groq.com/openai/v1",
    timeoutMs: 2_000,
    fetchImpl: fetchImpl as typeof fetch,
  });
}

describe("Groq evidence resolution from source records", () => {
  it("resolves sourceRecordId to actual settlement amount", async () => {
    const provider = makeProvider(async () => modelSays({
      decision: "MATCHED",
      confidence: 0.95,
      matchedRecordId: "stl_0006",
      reason: "Settlement matches payment.",
      evidence: [{ field: "settlement.total", sourceRecordId: "stl_0006", detail: "Amount matches" }],
    }));
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("MATCHED");
    expect(result.evidence[0].actual).toBe(24999);
    expect(result.evidence[0].expected).toBe(24999);
  });

  it("model returning actual=249 for source amount 24999 resolves to 24999", async () => {
    const provider = makeProvider(async () => modelSays({
      decision: "MATCHED",
      confidence: 0.95,
      matchedRecordId: "stl_0006",
      reason: "Settlement matches.",
      evidence: [{ field: "settlement.total", sourceRecordId: "stl_0006", actual: 249, detail: "hallucinated" }],
    }));
    const result = await provider.judge(CONTEXT);
    // The resolved value should be 24999, not 249
    expect(result.evidence[0].actual).toBe(24999);
  });

  it("nonexistent sourceRecordId resolves to null", async () => {
    const provider = makeProvider(async () => modelSays({
      decision: "MATCHED",
      confidence: 0.95,
      matchedRecordId: "stl_0006",
      reason: "Settlement matches.",
      evidence: [{ field: "settlement.total", sourceRecordId: "stl_FAKE", detail: "bad ref" }],
    }));
    const result = await provider.judge(CONTEXT);
    expect(result.evidence[0].actual).toBeNull();
  });

  it("MATCHED with invalid settlement ID is rejected", async () => {
    const provider = makeProvider(async () => modelSays({
      decision: "MATCHED",
      confidence: 0.95,
      matchedRecordId: "stl_FAKE",
      reason: "Match.",
      evidence: [],
    }));
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
  });

  it("REVIEW with null matchedRecordId is valid", async () => {
    const provider = makeProvider(async () => modelSays({
      decision: "REVIEW",
      confidence: 0.5,
      matchedRecordId: null,
      reason: "Ambiguous evidence.",
      evidence: [],
    }));
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.matchedRecordId).toBeNull();
  });

  it("evidence without sourceRecordId resolves to null values", async () => {
    const provider = makeProvider(async () => modelSays({
      decision: "REVIEW",
      confidence: 0.5,
      matchedRecordId: null,
      reason: "Insufficient evidence.",
      evidence: [{ field: "settlement.total", detail: "no source ref" }],
    }));
    const result = await provider.judge(CONTEXT);
    expect(result.evidence[0].actual).toBeNull();
  });

  // REGRESSION: evidence must NOT become [{}, {}] when model returns empty objects
  it("empty evidence objects are filtered out, not preserved as [{}, {}]", async () => {
    const provider = makeProvider(async () => modelSays({
      decision: "REVIEW",
      confidence: 0.4,
      matchedRecordId: null,
      reason: "Ambiguous.",
      evidence: [{}, {}],
    }));
    const result = await provider.judge(CONTEXT);
    // Empty objects must be filtered — evidence should be empty, not [{field:"unknown"}, {field:"unknown"}]
    expect(result.evidence).toHaveLength(0);
    expect(result.evidence).not.toEqual([{}, {}]);
  });

  // REGRESSION: evidence with valid fields must preserve those fields
  it("valid evidence items with field/detail/sourceRecordId are preserved", async () => {
    const provider = makeProvider(async () => modelSays({
      decision: "MATCHED",
      confidence: 0.9,
      matchedRecordId: "stl_0006",
      reason: "Exact match.",
      evidence: [
        { field: "settlement.total", sourceRecordId: "stl_0006", detail: "Amount matches payment" },
        { field: "payment.amount", sourceRecordId: "pay_0006", detail: "Payment amount verified" },
      ],
    }));
    const result = await provider.judge(CONTEXT);
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence[0].field).toBe("settlement.total");
    expect(result.evidence[0].actual).toBe(24999);
    expect(result.evidence[0].detail).toBe("Amount matches payment");
    expect(result.evidence[1].field).toBe("payment.amount");
  });

  // REGRESSION: model returning evidence with non-standard field names
  it("evidence items missing 'field' property are filtered out", async () => {
    const provider = makeProvider(async () => modelSays({
      decision: "REVIEW",
      confidence: 0.3,
      matchedRecordId: null,
      reason: "Unclear.",
      evidence: [
        { type: "amount_check", value: 12000 },
        { field: "settlement.total", detail: "valid item" },
      ],
    }));
    const result = await provider.judge(CONTEXT);
    // Only the item with 'field' should survive
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].field).toBe("settlement.total");
  });
});
