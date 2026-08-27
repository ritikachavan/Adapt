import { describe, expect, it } from "vitest";
import { investigate } from "../lib/investigation/agent";
import type { FinancialDataBundle, DecisionResult } from "../lib/types";

function mkBundle(overrides?: Partial<FinancialDataBundle>): FinancialDataBundle {
  return {
    orders: overrides?.orders ?? [{ id: "ord_001", customerId: "cust_001", amount: 5000, currency: "INR", createdAt: "2024-01-15" }],
    payments: overrides?.payments ?? [{ id: "pay_001", orderId: "ord_001", amount: 5000, status: "SETTLED", timestamp: "2024-01-15" }],
    settlements: overrides?.settlements ?? [{ id: "stl_001", paymentId: "pay_001", amount: 5000, fee: 50, settlementDate: "2024-01-16" }],
    refunds: overrides?.refunds ?? [],
    ledger: overrides?.ledger ?? [],
  };
}

function mkDecision(overrides?: Partial<DecisionResult>): DecisionResult {
  return { transactionId: "pay_001", decision: "REVIEW", confidence: 0.5, reason: "test", evidence: [], matchedRecordId: null, source: "DETERMINISTIC", ...overrides };
}

describe("Investigation Agent", () => {
  it("strong single settlement candidate → MATCH_CANDIDATE", () => {
    const r = investigate("pay_001", mkBundle(), mkDecision());
    expect(r.recommendation).toBe("MATCH_CANDIDATE");
    expect(r.confidence).toBe(0.85);
    expect(r.humanReviewRequired).toBe(false);
    expect(r.settlementCandidates).toHaveLength(1);
    expect(r.controlPlan.actionType).toBe("VERIFY_REFERENCE");
    expect(r.controlPlan.authority).toContain("Recommendation only");
  });

  it("multiple settlement candidates → REVIEW", () => {
    const b = mkBundle({ settlements: [
      { id: "stl_001", paymentId: "pay_001", amount: 5000, fee: 50, settlementDate: "2024-01-16" },
      { id: "stl_002", paymentId: "pay_001", amount: 5000, fee: 30, settlementDate: "2024-01-17" },
    ]});
    const r = investigate("pay_001", b, mkDecision());
    expect(r.recommendation).toBe("REVIEW");
    expect(r.settlementCandidates).toHaveLength(2);
    expect(r.controlPlan.actionType).toBe("REVIEW_CANDIDATES");
    expect(r.whyUnresolved).toContain("settlement candidates remain plausible");
  });

  it("amount mismatch → REVIEW", () => {
    const b = mkBundle({ settlements: [{ id: "stl_001", paymentId: "pay_001", amount: 3000, fee: 50, settlementDate: "2024-01-16" }] });
    const r = investigate("pay_001", b, mkDecision());
    expect(r.recommendation).toBe("REVIEW");
    expect(r.settlementCandidates[0].amountMatch).toBe(false);
    expect(r.controlPlan.actionType).toBe("INVESTIGATE_MORE");
  });

  it("no settlement candidates → REVIEW", () => {
    const r = investigate("pay_001", mkBundle({ settlements: [] }), mkDecision());
    expect(r.recommendation).toBe("REVIEW");
    expect(r.settlementCandidates).toHaveLength(0);
    expect(r.controlPlan.finding).toContain("No reliable settlement");
    expect(r.whyUnresolved).toContain("No settlement candidate");
  });

  it("generates Control Plan for every case", () => {
    const r = investigate("pay_001", mkBundle(), mkDecision());
    expect(r.controlPlan.finding).toBeTruthy();
    expect(r.controlPlan.evidence).toBeTruthy();
    expect(r.controlPlan.uncertainty).toBeTruthy();
    expect(r.controlPlan.recommendedAction).toBeTruthy();
    expect(r.controlPlan.authority).toBeTruthy();
  });

  it("whyUnresolved is null for MATCH_CANDIDATE", () => {
    const r = investigate("pay_001", mkBundle(), mkDecision());
    expect(r.whyUnresolved).toBeNull();
  });

  it("whyUnresolved is set for REVIEW", () => {
    const r = investigate("pay_001", mkBundle({ settlements: [] }), mkDecision());
    expect(r.whyUnresolved).toBeTruthy();
  });

  it("no special-case behavior for pay_0014", () => {
    const b = mkBundle({
      payments: [{ id: "pay_0014", orderId: "ord_0014", amount: 4999, status: "SETTLED", timestamp: "2024-01-15" }],
      settlements: [{ id: "stl_0014", paymentId: "pay_0014", amount: 4999, fee: 50, settlementDate: "2024-01-16" }],
    });
    const r = investigate("pay_0014", b, mkDecision({ transactionId: "pay_0014" }));
    expect(r.recommendation).toBe("MATCH_CANDIDATE");
    expect(r.controlPlan.finding).toContain("stl_0014");
  });

  it("never produces financial mutation actions", () => {
    const forbidden = ["AUTO_SETTLE", "AUTO_REFUND", "AUTO_PAYMENT", "AUTO_WRITE_OFF", "AUTO_DELETE"];
    const r = investigate("pay_001", mkBundle(), mkDecision());
    expect(forbidden).not.toContain(r.controlPlan.actionType);
  });

  it("settlement date unavailable is recorded honestly", () => {
    const b = mkBundle({ settlements: [{ id: "stl_001", paymentId: "pay_001", amount: 5000, fee: 50, settlementDate: "" }] });
    const r = investigate("pay_001", b, mkDecision());
    expect(r.evidence.settlementDateAvailable).toBe(false);
  });

  it("remainingRiskSignals extracts duplicate.lookalike", () => {
    const d = mkDecision({ evidence: [{ field: "duplicate.lookalike", expected: "none", actual: "pay_002", detail: "Same customer" }] });
    const r = investigate("pay_001", mkBundle(), d);
    expect(r.remainingRiskSignals.length).toBeGreaterThan(0);
    expect(r.remainingRiskSignals[0]).toContain("pay_002");
  });

  it("remainingRiskSignals extracts nearDuplicate", () => {
    const d = mkDecision({ evidence: [{ field: "reference.nearDuplicate", expected: "cust_001", actual: "cust_00b" }] });
    const r = investigate("pay_001", mkBundle(), d);
    expect(r.remainingRiskSignals.length).toBeGreaterThan(0);
  });

  it("remainingRiskSignals is empty when no risk signals", () => {
    const r = investigate("pay_001", mkBundle(), mkDecision({ evidence: [] }));
    expect(r.remainingRiskSignals).toHaveLength(0);
  });

  it("settlementCandidates terminology is used consistently", () => {
    const r = investigate("pay_001", mkBundle(), mkDecision());
    expect(r.settlementCandidates).toBeDefined();
    expect(r.steps[1].label).toContain("Settlement candidates");
  });

  it("investigation of one transaction never leaks another transaction's data", () => {
    // Bundle with two clearly distinct payments, each with its own settlement.
    const b: FinancialDataBundle = mkBundle({
      payments: [
        { id: "pay_001", orderId: "ord_001", amount: 5000, status: "SETTLED", timestamp: "2024-01-15" },
        { id: "pay_010", orderId: "ord_010", amount: 9999, status: "SETTLED", timestamp: "2024-02-10" },
      ],
      settlements: [
        { id: "stl_001", paymentId: "pay_001", amount: 5000, fee: 50, settlementDate: "2024-01-16" },
        { id: "stl_010", paymentId: "pay_010", amount: 9999, fee: 30, settlementDate: "2024-02-11" },
      ],
    });

    const r1 = investigate("pay_001", b, mkDecision({ transactionId: "pay_001" }));
    const r10 = investigate("pay_010", b, mkDecision({ transactionId: "pay_010" }));

    // Each result is explicitly associated with the transaction that requested it.
    expect(r1.transactionId).toBe("pay_001");
    expect(r10.transactionId).toBe("pay_010");

    // Candidate settlement IDs belong to the requested transaction only.
    expect(r1.settlementCandidates.map((c) => c.id)).toEqual(["stl_001"]);
    expect(r10.settlementCandidates.map((c) => c.id)).toEqual(["stl_010"]);
    expect(r1.settlementCandidates.some((c) => c.id.includes("010"))).toBe(false);
    expect(r10.settlementCandidates.some((c) => c.id.includes("001"))).toBe(false);

    // Amounts correspond to the requested transaction's own records.
    expect(r1.evidence.expectedAmount).toBe(5000);
    expect(r10.evidence.expectedAmount).toBe(9999);
    expect(r1.evidence.candidateAmounts).toEqual([5000]);
    expect(r10.evidence.candidateAmounts).toEqual([9999]);

    // Investigation progress identifies the requested transaction.
    expect(r1.steps[0].detail).toContain("pay_001");
    expect(r10.steps[0].detail).toContain("pay_010");
    expect(r1.steps[0].detail).not.toContain("pay_010");
    expect(r10.steps[0].detail).not.toContain("pay_001");
  });

  it("cross-transaction contamination regression test for pay_0006 and pay_0010", () => {
    // This test specifically validates the bug where pay_0010 data appeared when viewing pay_0006
    const b: FinancialDataBundle = mkBundle({
      payments: [
        { id: "pay_0006", orderId: "ord_0006", amount: 5000, status: "SETTLED", timestamp: "2024-01-15" },
        { id: "pay_0010", orderId: "ord_0010", amount: 249, status: "SETTLED", timestamp: "2024-02-10" },
      ],
      settlements: [
        { id: "stl_0006", paymentId: "pay_0006", amount: 5000, fee: 50, settlementDate: "2024-01-16" },
        { id: "stl_0010", paymentId: "pay_0010", amount: 249, fee: 30, settlementDate: "2024-02-11" },
      ],
    });

    const r6 = investigate("pay_0006", b, mkDecision({ transactionId: "pay_0006" }));
    const r10 = investigate("pay_0010", b, mkDecision({ transactionId: "pay_0010" }));

    // Validate pay_0006 investigation does NOT contain pay_0010 data
    expect(r6.transactionId).toBe("pay_0006");
    expect(r6.evidence.expectedAmount).toBe(5000);
    expect(r6.evidence.paymentReference).toBe("ord_0006");
    expect(r6.settlementCandidates.map((c) => c.id)).toEqual(["stl_0006"]);
    expect(r6.settlementCandidates.some((c) => c.id === "stl_0010")).toBe(false);
    expect(r6.settlementCandidates.some((c) => c.amount === 249)).toBe(false);
    expect(r6.evidence.candidateAmounts).not.toContain(249);

    // Validate pay_0010 investigation contains only pay_0010 data
    expect(r10.transactionId).toBe("pay_0010");
    expect(r10.evidence.expectedAmount).toBe(249);
    expect(r10.evidence.paymentReference).toBe("ord_0010");
    expect(r10.settlementCandidates.map((c) => c.id)).toEqual(["stl_0010"]);
    expect(r10.settlementCandidates.some((c) => c.id === "stl_0006")).toBe(false);
    expect(r10.settlementCandidates.some((c) => c.amount === 5000)).toBe(false);
    expect(r10.evidence.candidateAmounts).not.toContain(5000);
  });
});
