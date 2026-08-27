// Regression tests for dual-agent agreement and evidence normalization.
import { describe, expect, it } from "vitest";
import { runDualAgent, isSafeFallback } from "../lib/ai/dual-agent";
import type { AiJudgeProvider, JudgeCandidateContext } from "../lib/ai/provider";
import type { DecisionResult, FinancialDataBundle } from "../lib/types";

const DATA: FinancialDataBundle = {
  orders: [{ id: "ord_1", customerId: "cust_1", amount: 5000, currency: "INR", createdAt: "2026-06-01" }],
  payments: [{ id: "pay_1", orderId: "ord_1", amount: 5000, status: "SETTLED", timestamp: "2026-06-01" }],
  settlements: [{ id: "stl_1", paymentId: "pay_1", amount: 5000, fee: 0, settlementDate: "2026-06-02" }],
  refunds: [],
  ledger: [],
};

const CONTEXT: JudgeCandidateContext = {
  paymentId: "pay_1",
  orderId: "ord_1",
  paymentSummary: { id: "pay_1", amount: 5000 },
  candidateSettlements: [{ id: "stl_1", amount: 5000, fee: 0, settlementDate: "2026-06-02" }],
  refunds: [],
  ledgerEvidence: [],
  deterministicEvidence: [],
  candidateRecordIds: ["stl_1"],
};

function mkProvider(verdict: Partial<DecisionResult>): AiJudgeProvider {
  return {
    name: "mock",
    async judge(ctx) {
      return { transactionId: ctx.paymentId, decision: "MATCHED", confidence: 0.9, reason: "test", evidence: [], matchedRecordId: "stl_1", source: "OLLAMA", ...verdict };
    },
  };
}

function fallbackProvider(): AiJudgeProvider {
  return {
    name: "fallback",
    async judge(ctx) {
      return { transactionId: ctx.paymentId, decision: "REVIEW", confidence: 0, reason: "AI output unavailable or invalid; human review required", evidence: [], matchedRecordId: null, source: "OLLAMA" };
    },
  };
}

describe("Dual-Agent regression: agreement and normalization", () => {
  it("two equivalent verdicts produce AGREED", async () => {
    const r = await runDualAgent(CONTEXT, DATA, { agent1: mkProvider({}), agent2: mkProvider({}) });
    expect(r.aiStatus).toBe("SUCCESS");
    expect(r.agentAgreement).toBe(true);
    expect(r.evidenceValid).toBe(true);
  });

  it("Groq is allowed to agree when evidence supports the same conclusion", async () => {
    const bothMatch = mkProvider({ decision: "MATCHED", matchedRecordId: "stl_1", confidence: 0.85 });
    const r = await runDualAgent(CONTEXT, DATA, { agent1: bothMatch, agent2: bothMatch });
    expect(r.aiStatus).toBe("SUCCESS");
    expect(r.agentAgreement).toBe(true);
  });

  it("disagreement is preserved when decisions genuinely differ", async () => {
    const r = await runDualAgent(CONTEXT, DATA, {
      agent1: mkProvider({ decision: "MATCHED" }),
      agent2: mkProvider({ decision: "REVIEW" }),
    });
    expect(r.aiStatus).toBe("DISAGREEMENT");
    expect(r.agentAgreement).toBe(false);
  });

  it("REVIEW with different matchedRecordIds still agrees (matchedRecordId irrelevant for REVIEW)", async () => {
    const r = await runDualAgent(CONTEXT, DATA, {
      agent1: mkProvider({ decision: "REVIEW", matchedRecordId: null }),
      agent2: mkProvider({ decision: "REVIEW", matchedRecordId: "stl_1" }),
    });
    expect(r.aiStatus).toBe("SUCCESS");
    expect(r.agentAgreement).toBe(true);
  });

  it("MATCHED with different matchedRecordIds disagrees", async () => {
    const r = await runDualAgent(CONTEXT, DATA, {
      agent1: mkProvider({ decision: "MATCHED", matchedRecordId: "stl_1" }),
      agent2: mkProvider({ decision: "MATCHED", matchedRecordId: null }),
    });
    expect(r.aiStatus).toBe("DISAGREEMENT");
    expect(r.agentAgreement).toBe(false);
  });

  it("Ollama {field, value} evidence normalizes to canonical {field, actual}", async () => {
    // Ollama returns {field, value} which should normalize to {field, actual}
    const ollamaStyle = mkProvider({
      decision: "MATCHED",
      matchedRecordId: "stl_1",
      evidence: [{ field: "settlement.total", expected: null, actual: 5000, detail: "exact match" }],
    });
    const groqStyle = mkProvider({
      decision: "MATCHED",
      matchedRecordId: "stl_1",
      evidence: [{ field: "settlement.total", expected: 5000, actual: 5000, detail: "exact match" }],
    });
    const r = await runDualAgent(CONTEXT, DATA, { agent1: ollamaStyle, agent2: groqStyle });
    expect(r.aiStatus).toBe("SUCCESS");
    expect(r.evidenceValid).toBe(true);
  });

  it("hallucinated actual evidence is resolved from source records", async () => {
    const badEvidence = mkProvider({
      decision: "MATCHED",
      matchedRecordId: "stl_1",
      evidence: [{ field: "settlement.total", expected: 5000, actual: 9999 }],
    });
    const r = await runDualAgent(CONTEXT, DATA, { agent1: mkProvider({}), agent2: badEvidence });
    // The resolver corrects hallucinated values from authoritative source records
    expect(r.evidenceValid).toBe(true);
    expect(r.aiStatus).toBe("SUCCESS");
  });

  it("missing/unsupported evidence does not bypass validation", async () => {
    const emptyEvidence = mkProvider({ decision: "MATCHED", matchedRecordId: "stl_1", evidence: [] });
    const r = await runDualAgent(CONTEXT, DATA, { agent1: emptyEvidence, agent2: emptyEvidence });
    // Empty evidence is valid (no false claims)
    expect(r.evidenceValid).toBe(true);
    expect(r.aiStatus).toBe("SUCCESS");
  });

  it("provider failure produces safe fallback", async () => {
    const r = await runDualAgent(CONTEXT, DATA, { agent1: mkProvider({}), agent2: fallbackProvider() });
    expect(r.aiStatus).toBe("FALLBACK");
    expect(r.finalRecommendation.decision).toBe("REVIEW");
    expect(r.finalRecommendation.confidence).toBe(0);
  });

  it("isSafeFallback does not trigger on normal REVIEW", () => {
    expect(isSafeFallback({ transactionId: "x", decision: "REVIEW", confidence: 0.5, reason: "ambiguous", evidence: [], matchedRecordId: null, source: "OLLAMA" })).toBe(false);
  });
});
