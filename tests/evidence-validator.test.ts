// Unit tests for the deterministic Evidence Validator.
import { describe, expect, it } from "vitest";
import { validateVerdict } from "../lib/ai/evidence-validator";
import type { DecisionResult, FinancialDataBundle } from "../lib/types";
import type { JudgeCandidateContext } from "../lib/ai/provider";

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

function mkVerdict(patch: Partial<DecisionResult> = {}): DecisionResult {
  return { transactionId: "pay_1", decision: "MATCHED", confidence: 0.95, reason: "test", evidence: [], matchedRecordId: "stl_1", source: "OLLAMA", ...patch };
}

describe("Evidence Validator", () => {
  it("accepts a valid verdict", () => {
    const r = validateVerdict(mkVerdict(), CONTEXT, DATA);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("rejects non-existent transaction ID", () => {
    const r = validateVerdict(mkVerdict({ transactionId: "pay_FAKE" }), CONTEXT, DATA);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === "transactionId")).toBe(true);
  });

  it("rejects hallucinated matchedRecordId", () => {
    const r = validateVerdict(mkVerdict({ matchedRecordId: "stl_FAKE" }), CONTEXT, DATA);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === "matchedRecordId")).toBe(true);
  });

  it("rejects settlement that belongs to different payment", () => {
    const data2: FinancialDataBundle = {
      ...DATA,
      settlements: [{ id: "stl_1", paymentId: "pay_OTHER", amount: 5000, fee: 0, settlementDate: "2026-06-02" }],
    };
    const r = validateVerdict(mkVerdict(), CONTEXT, data2);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === "matchedRecordId" && e.claim.includes("pay_OTHER"))).toBe(true);
  });

  it("rejects incorrect settlement amount in evidence", () => {
    const v = mkVerdict({ evidence: [{ field: "settlement.total", expected: 5000, actual: 9999 }] });
    const r = validateVerdict(v, CONTEXT, DATA);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === "evidence.settlement.total")).toBe(true);
  });

  it("rejects invalid decision value", () => {
    const v = mkVerdict({ decision: "INVALID" as DecisionResult["decision"] });
    const r = validateVerdict(v, CONTEXT, DATA);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === "decision")).toBe(true);
  });

  it("rejects out-of-range confidence", () => {
    const r = validateVerdict(mkVerdict({ confidence: 1.5 }), CONTEXT, DATA);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === "confidence")).toBe(true);
  });
});
