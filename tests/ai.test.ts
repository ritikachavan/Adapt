// Unit tests for the local AI judge. NO Ollama server is required —
// the HTTP layer is injected and mocked in every test.
import { describe, expect, it } from "vitest";
import { createOllamaJudgeProvider } from "../lib/ai/ollama";
import { createSafeFallback } from "../lib/ai/provider";
import type { OllamaRequestInit } from "../lib/ai/ollama";

const CONTEXT = {
  paymentId: "pay_42",
  orderId: "ord_42",
  paymentSummary: { id: "pay_42", amount: 12000, currency: "INR" },
  candidateSettlements: [
    { id: "stl_9", amount: 11500, fee: 230, settlementDate: "2026-06-03T00:00:00.000Z" },
  ],
  refunds: [],
  ledgerEvidence: [],
  deterministicEvidence: [
    { field: "settlement.total", detail: "short by 500 beyond fee" },
  ],
  candidateRecordIds: ["stl_9"],
};

/** HTTP 200 whose Ollama-style body carries the model's raw JSON text. */
function modelSays(verdict: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ response: JSON.stringify(verdict) }),
  };
}

function makeProvider(fetchImpl: (url: string, init: OllamaRequestInit) => Promise<unknown>) {
  return createOllamaJudgeProvider({
    baseUrl: "http://localhost:11434",
    model: "qwen2.5:7b-instruct",
    timeoutMs: 2_000,
    fetchImpl: fetchImpl as never,
  });
}

describe("ollama AI judge", () => {
  it("returns a valid MATCHED verdict with structured evidence", async () => {
    let capturedUrl = "";
    let capturedBody: { model?: string } = {};
    const provider = makeProvider(async (url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return modelSays({
        decision: "MATCHED",
        confidence: 0.92,
        matchedRecordId: "stl_9",
        reason: "Settlement amount reconciles within tolerance.",
        evidence: [
          { field: "amount", value: "11500", significance: "matches net expectation" },
        ],
      });
    });

    const result = await provider.judge(CONTEXT);

    expect(result.transactionId).toBe("pay_42");
    expect(result.decision).toBe("MATCHED");
    expect(result.confidence).toBe(0.92);
    expect(result.matchedRecordId).toBe("stl_9");
    expect(result.source).toBe("OLLAMA");
    expect(result.evidence).toHaveLength(1);
    expect(capturedUrl).toContain("/api/generate");
    expect(capturedBody.model).toBe("qwen2.5:7b-instruct");
  });

  it("returns a valid REVIEW verdict untouched", async () => {
    const provider = makeProvider(
      async () =>
        modelSays({
          decision: "REVIEW",
          confidence: 0.4,
          matchedRecordId: null,
          reason: "Evidence conflicts.",
          evidence: [],
        })
    );
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.matchedRecordId).toBeNull();
    expect(result.source).toBe("OLLAMA");
  });

  it("returns a valid REFUNDED verdict untouched", async () => {
    const provider = makeProvider(
      async () =>
        modelSays({
          decision: "REFUNDED",
          confidence: 0.88,
          matchedRecordId: "stl_9",
          reason: "Refund record explains the money movement.",
          evidence: [],
        })
    );
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REFUNDED");
    expect(result.confidence).toBe(0.88);
  });
  it("falls back safely on malformed JSON output", async () => {
    const provider = makeProvider(
      async () => modelSays("{ decision: MATCHED,, nope")
    );
    const result = await provider.judge(CONTEXT);
    expect(result).toEqual(createSafeFallback("pay_42"));
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
  });

  it("falls back safely on an invalid decision label", async () => {
    const provider = makeProvider(
      async () =>
        modelSays({
          decision: "APPROVED",
          confidence: 0.9,
          matchedRecordId: null,
          reason: "invented label",
          evidence: [],
        })
    );
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
    expect(result.matchedRecordId).toBeNull();
  });

  it("falls back safely when confidence is above 1", async () => {
    const provider = makeProvider(
      async () =>
        modelSays({
          decision: "MATCHED",
          confidence: 1.5,
          matchedRecordId: "stl_9",
          reason: "overconfident",
          evidence: [],
        })
    );
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
  });

  it("falls back safely when confidence is below 0", async () => {
    const provider = makeProvider(
      async () =>
        modelSays({
          decision: "MATCHED",
          confidence: -0.1,
          matchedRecordId: "stl_9",
          reason: "negative confidence",
          evidence: [],
        })
    );
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
  });

  it("falls back safely on a hallucinated matchedRecordId", async () => {
    const provider = makeProvider(
      async () =>
        modelSays({
          decision: "MATCHED",
          confidence: 0.99,
          matchedRecordId: "stl_999_invented",
          reason: "references a record that was never supplied",
          evidence: [],
        })
    );
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.matchedRecordId).toBeNull();
    expect(result.reason).toBe(createSafeFallback("pay_42").reason);
  });

  it("falls back safely on a missing required field (no reason)", async () => {
    const provider = makeProvider(
      async () =>
        modelSays({ decision: "MATCHED", confidence: 0.5, matchedRecordId: null })
    );
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
  });

  it("falls back safely when Ollama is unavailable", async () => {
    const provider = makeProvider(async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:11434");
    });
    const result = await provider.judge(CONTEXT);
    expect(result).toEqual(createSafeFallback("pay_42"));
  });

  it("falls back safely when the request times out", async () => {
    const provider = createOllamaJudgeProvider({
      baseUrl: "http://localhost:11434",
      model: "qwen2.5:7b-instruct",
      timeoutMs: 20, // tiny so the abort fires quickly under real timers
      fetchImpl: ((_url: string, init: OllamaRequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new Error("request aborted"))
          );
        })) as never,
    });
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it("falls back safely on an empty model response", async () => {
    const provider = makeProvider(async () => modelSays(""));
    const result = await provider.judge(CONTEXT);
    expect(result.decision).toBe("REVIEW");
    expect(result.confidence).toBe(0);
    expect(result.reason).toBe(createSafeFallback("pay_42").reason);
  });

  it("sends the mandatory safety rules to the model", async () => {
    let promptBody = "";
    const provider = makeProvider(async (_url, init) => {
      promptBody = init.body;
      return modelSays({
        decision: "REVIEW",
        confidence: 0.3,
        matchedRecordId: null,
        reason: "insufficient",
        evidence: [],
      });
    });
    await provider.judge(CONTEXT);
    for (const phrase of [
      "not authorized to invent records",
      "Similarity alone is insufficient for approval.",
      "Prefer REVIEW over an unsupported MATCHED decision.",
      "candidateRecordIds",
    ]) {
      expect(promptBody).toContain(phrase);
    }
  });
});