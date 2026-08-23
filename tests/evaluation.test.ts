// Unit tests for the evaluation engine over tiny in-memory fixtures.
import { describe, expect, it } from "vitest";
import {
  evaluateReconciliation,
  GROUND_TRUTH_SCENARIOS,
  type GroundTruthCase,
} from "../lib/evaluation";
import type { DecisionResult, ReconciliationDecision } from "../lib/types";

function gtCase(
  paymentId: string,
  patch: Partial<GroundTruthCase> = {}
): GroundTruthCase {
  return {
    caseId: `GT-${paymentId}`,
    orderId: `ord_${paymentId.replace("pay", "")}`,
    paymentId,
    scenario: "NORMAL_MATCH",
    expectedDecision: "MATCHED",
    expectedOutcome: "FULL_MATCH",
    reviewRequired: false,
    relatedOrderId: null,
    note: "",
    ...patch,
  };
}

function decision(
  transactionId: string,
  d: ReconciliationDecision = "MATCHED"
): DecisionResult {
  return {
    transactionId,
    decision: d,
    confidence: 0.99,
    reason: "fixture",
    evidence: [],
    matchedRecordId: null,
    source: "DETERMINISTIC",
  };
}

describe("evaluateReconciliation", () => {
  it("scores 100% correct decisions perfectly", () => {
    const report = evaluateReconciliation({
      groundTruth: [
        gtCase("pay_1"),
        gtCase("pay_2", { scenario: "REFUND" }),
        gtCase("pay_3", {
          scenario: "DUPLICATE_LOOKALIKE",
          expectedDecision: "REVIEW",
          reviewRequired: true,
        }),
      ],
      decisions: [
        decision("pay_1", "MATCHED"),
        decision("pay_2", "REFUNDED"), // canonical MATCHED
        decision("pay_3", "REVIEW"),
      ],
    });
    expect(report.totals.totalCases).toBe(3);
    expect(report.totals.correctDecisions).toBe(3);
    expect(report.totals.incorrectDecisions).toBe(0);
    expect(report.totals.accuracy).toBe(1);
    expect(report.errors).toEqual([]);
  });

  it("scores partially incorrect runs and returns detailed error records", () => {
    const report = evaluateReconciliation({
      groundTruth: [
        gtCase("pay_1"),
        gtCase("pay_2"),
        gtCase("pay_3"),
        gtCase("pay_4", {
          scenario: "AMOUNT_MISMATCH",
          expectedDecision: "REVIEW",
          reviewRequired: true,
        }),
      ],
      decisions: [
        decision("pay_1", "MATCHED"),
        decision("pay_2", "MISSING"), // wrong: GT wanted MATCHED
        decision("pay_3", "MATCHED"),
        decision("pay_4", "MISMATCH"), // wrong: GT wanted REVIEW
      ],
    });
    expect(report.totals.accuracy).toBeCloseTo(0.5);
    expect(report.totals.correctDecisions).toBe(2);
    expect(report.totals.incorrectDecisions).toBe(2);
    expect(report.errors).toHaveLength(2);
    const err = report.errors[0];
    expect(err.transactionId).toBe("pay_2");
    expect(err.caseId).toBe("GT-pay_2");
    expect(err.expectedDecision).toBe("MATCHED");
    expect(err.actualDecision).toBe("MISSING");
    expect(err.scenario).toBe("NORMAL_MATCH");
    expect(err.reason).toContain("MISSING");
  });

  it("scores a completely wrong run at zero accuracy", () => {
    const report = evaluateReconciliation({
      groundTruth: [gtCase("pay_1"), gtCase("pay_2")],
      decisions: [decision("pay_1", "MISSING"), decision("pay_2", "MISMATCH")],
    });
    expect(report.totals.correctDecisions).toBe(0);
    expect(report.totals.incorrectDecisions).toBe(2);
    expect(report.totals.accuracy).toBe(0);
    expect(report.errors).toHaveLength(2);
  });
  it("computes review rate, auto-resolution rate, precision and recall", () => {
    // GT: pay_1 MATCHED, pay_2 REVIEW, pay_3 REVIEW, pay_4 MATCHED
    // Actual: pay_1 MATCHED, pay_2 REVIEW (TP), pay_3 MATCHED (FN), pay_4 REVIEW (FP)
    const report = evaluateReconciliation({
      groundTruth: [
        gtCase("pay_1"),
        gtCase("pay_2", { expectedDecision: "REVIEW", reviewRequired: true }),
        gtCase("pay_3", { expectedDecision: "REVIEW", reviewRequired: true }),
        gtCase("pay_4"),
      ],
      decisions: [
        decision("pay_1", "MATCHED"),
        decision("pay_2", "REVIEW"),
        decision("pay_3", "MATCHED"),
        decision("pay_4", "REVIEW"),
      ],
    });
    expect(report.totals.reviewRate).toBeCloseTo(0.5);
    expect(report.totals.autoResolutionRate).toBeCloseTo(0.5);
    expect(report.totals.precision).toBeCloseTo(0.5); // 1 TP / (1 TP + 1 FP)
    expect(report.totals.recall).toBeCloseTo(0.5); // 1 TP / (1 TP + 1 FN)
    expect(report.totals.correctDecisions).toBe(2);
  });

  it("builds a confusion matrix covering all five decision labels", () => {
    const report = evaluateReconciliation({
      groundTruth: [
        gtCase("pay_1"),
        gtCase("pay_2", { scenario: "REFUND" }),
        gtCase("pay_3", {
          scenario: "AMOUNT_MISMATCH",
          expectedDecision: "REVIEW",
          reviewRequired: true,
        }),
        gtCase("pay_4", {
          scenario: "MISSING_SETTLEMENT",
          expectedDecision: "UNMATCHED",
        }),
        gtCase("pay_5", {
          scenario: "DUPLICATE_LOOKALIKE",
          expectedDecision: "REVIEW",
          reviewRequired: true,
        }),
      ],
      decisions: [
        decision("pay_1", "MATCHED"),
        decision("pay_2", "REFUNDED"),
        decision("pay_3", "MISMATCH"),
        decision("pay_4", "MISSING"),
        decision("pay_5", "REVIEW"),
      ],
    });
    const m = report.confusionMatrix;
    expect(m.MATCHED.expectedMatched).toBe(1);
    expect(m.REFUNDED.expectedMatched).toBe(1); // REFUNDED counts as resolved
    expect(m.MISMATCH.expectedReview).toBe(1);
    expect(m.MISSING.expectedProblem).toBe(1);
    expect(m.REVIEW.expectedReview).toBe(1);
    expect(Object.keys(m).sort()).toEqual([
      "MATCHED",
      "MISMATCH",
      "MISSING",
      "REFUNDED",
      "REVIEW",
    ]);
  });

  it("reports per-scenario accuracy for all ten known scenarios", () => {
    const report = evaluateReconciliation({
      groundTruth: [
        gtCase("pay_1", { scenario: "NORMAL_MATCH" }),
        gtCase("pay_2", { scenario: "GATEWAY_FEE" }),
        gtCase("pay_3", {
          scenario: "AMOUNT_MISMATCH",
          expectedDecision: "REVIEW",
          reviewRequired: true,
        }),
      ],
      decisions: [
        decision("pay_1", "MATCHED"),
        decision("pay_2", "MATCHED"),
        decision("pay_3", "MISMATCH"), // wrong: GT wants REVIEW here
      ],
    });
    const byScenario = Object.fromEntries(
      report.scenarioPerformance.map((s) => [s.scenario, s])
    );
    expect(report.scenarioPerformance).toHaveLength(10);
    expect(report.scenarioPerformance.map((s) => s.scenario)).toEqual([
      ...GROUND_TRUTH_SCENARIOS,
    ]);
    expect(byScenario.NORMAL_MATCH).toMatchObject({
      total: 1,
      correct: 1,
      accuracy: 1,
    });
    expect(byScenario.GATEWAY_FEE).toMatchObject({ total: 1, correct: 1 });
    expect(byScenario.AMOUNT_MISMATCH).toMatchObject({
      total: 1,
      correct: 0,
      accuracy: 0,
    });
    expect(byScenario.DELAYED_SETTLEMENT).toMatchObject({ total: 0, accuracy: 0 });
  });

  it("handles empty input without producing NaNs", () => {
    const report = evaluateReconciliation({ groundTruth: [], decisions: [] });
    expect(report.totals.totalCases).toBe(0);
    expect(report.totals.accuracy).toBe(0);
    expect(report.totals.precision).toBe(0);
    expect(report.totals.recall).toBe(0);
    expect(report.totals.reviewRate).toBe(0);
    expect(report.totals.autoResolutionRate).toBe(0);
    expect(report.errors).toEqual([]);
    expect(report.confusionMatrix.MATCHED.expectedMatched).toBe(0);
    expect(report.scenarioPerformance.every((s) => s.total === 0)).toBe(true);
  });

  it("excludes decisions without a ground-truth case from scoring", () => {
    const report = evaluateReconciliation({
      groundTruth: [gtCase("pay_1")],
      decisions: [decision("pay_1", "MATCHED"), decision("pay_99", "MATCHED")],
    });
    expect(report.totals.totalCases).toBe(1);
    expect(report.totals.accuracy).toBe(1);
    expect(report.totals.unmatchedTransactionCount).toBe(1);
    expect(report.unmatchedTransactionIds).toEqual(["pay_99"]);
  });

  it("keeps only the first decision when a transaction is judged twice", () => {
    const report = evaluateReconciliation({
      groundTruth: [gtCase("pay_1")],
      decisions: [decision("pay_1", "MATCHED"), decision("pay_1", "MISSING")],
    });
    expect(report.totals.totalCases).toBe(1);
    expect(report.totals.correctDecisions).toBe(1);
    expect(report.totals.duplicateDecisionCount).toBe(1);
    expect(report.duplicateTransactionIds).toEqual(["pay_1"]);
  });

  it("is deterministic: identical inputs produce identical reports", () => {
    const input = {
      groundTruth: [gtCase("pay_1"), gtCase("pay_2", { scenario: "REFUND" })],
      decisions: [decision("pay_1", "MATCHED"), decision("pay_2", "REFUNDED")],
    };
    expect(JSON.stringify(evaluateReconciliation(input))).toBe(
      JSON.stringify(evaluateReconciliation(input))
    );
  });
});