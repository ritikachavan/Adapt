// Unit tests for the Dual-Agent Orchestrator.
import { describe, expect, it } from "vitest";
import { runDualAgent } from "../lib/ai/dual-agent";
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

describe("Dual-Agent Orchestrator", () => {
  it("SUCCESS when both agents agree and evidence is valid", async () => {
    const r = await runDualAgent(CONTEXT, DATA, { agent1: mkProvider({}), agent2: mkProvider({}) });
    expect(r.aiStatus).toBe("SUCCESS");
    expect(r.agentAgreement).toBe(true);
    expect(r.evidenceValid).toBe(true);
    expect(r.finalRecommendation.decision).toBe("MATCHED");
    expect(r.failureReason).toBeNull();
  });

  it("DISAGREEMENT when agents produce different decisions", async () => {
    const r = await runDualAgent(CONTEXT, DATA, {
      agent1: mkProvider({ decision: "MATCHED" }),
      agent2: mkProvider({ decision: "REVIEW" }),
    });
    expect(r.aiStatus).toBe("DISAGREEMENT");
    expect(r.agentAgreement).toBe(false);
    expect(r.finalRecommendation.decision).toBe("REVIEW");
    expect(r.failureReason).toContain("Agent 1: MATCHED vs Agent 2: REVIEW");
  });

  it("FALLBACK when one agent fails", async () => {
    const r = await runDualAgent(CONTEXT, DATA, { agent1: mkProvider({}), agent2: fallbackProvider() });
    expect(r.aiStatus).toBe("FALLBACK");
    expect(r.finalRecommendation.decision).toBe("REVIEW");
  });

  it("UNAVAILABLE when both agents fail", async () => {
    const r = await runDualAgent(CONTEXT, DATA, { agent1: fallbackProvider(), agent2: fallbackProvider() });
    expect(r.aiStatus).toBe("UNAVAILABLE");
    expect(r.finalRecommendation.decision).toBe("REVIEW");
  });

  it("hallucinated amount is resolved from source records", async () => {
    const r = await runDualAgent(CONTEXT, DATA, {
      agent1: mkProvider({ evidence: [{ field: "settlement.total", expected: 5000, actual: 9999 }] }),
      agent2: mkProvider({ evidence: [{ field: "settlement.total", expected: 5000, actual: 9999 }] }),
    });
    // The resolver corrects hallucinated values from authoritative source records
    expect(r.evidenceValid).toBe(true);
    expect(r.aiStatus).toBe("SUCCESS");
  });
});
