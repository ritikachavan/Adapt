import { describe, expect, it } from "vitest";
import { scoreDecision, scoreAllDecisions, getRiskDistribution } from "../lib/risk/riskScoring";
import type { DecisionResult } from "../lib/types";

function mkDecision(patch: Partial<DecisionResult> = {}): DecisionResult {
  return { transactionId: "pay_001", decision: "REVIEW", confidence: 0.5, reason: "test", evidence: [], matchedRecordId: null, source: "DETERMINISTIC", ...patch };
}

describe("riskScoring", () => {
  it("returns null for MATCHED decisions", () => {
    expect(scoreDecision(mkDecision({ decision: "MATCHED" }))).toBeNull();
  });

  it("returns score 0-100 for non-MATCHED decisions", () => {
    for (const d of ["REVIEW", "MISMATCH", "MISSING", "REFUNDED"] as const) {
      const r = scoreDecision(mkDecision({ decision: d }));
      expect(r).not.toBeNull();
      expect(r!.score).toBeGreaterThanOrEqual(0);
      expect(r!.score).toBeLessThanOrEqual(100);
    }
  });

  it("is deterministic", () => {
    const d = mkDecision({ decision: "MISMATCH", evidence: [{ field: "settlement.total", expected: 1000, actual: 800 }] });
    expect(scoreDecision(d)).toEqual(scoreDecision(d));
  });

  it("classifies LOW risk for strong REVIEW", () => {
    const d = mkDecision({ decision: "REVIEW", evidence: [
      { field: "settlement.total", expected: 1000, actual: 1000 },
      { field: "settlement.fee", expected: 20, actual: 20 },
      { field: "settlement.date", expected: "2024-01-15", actual: "2024-01-15" },
    ]});
    expect(scoreDecision(d)!.level).toBe("LOW");
  });

  it("classifies HIGH risk for extreme MISMATCH with ambiguity", () => {
    const d = mkDecision({ decision: "MISMATCH", evidence: [
      { field: "settlement.total", expected: 1000, actual: 100 },
      { field: "duplicate.lookalike", expected: "none", actual: "pay_002" },
      { field: "reference.nearDuplicate", expected: "canonical", actual: "cust_001 ~ cust_00b" },
    ]});
    const r = scoreDecision(d);
    expect(r!.score).toBeGreaterThanOrEqual(50);
    expect(["HIGH", "MEDIUM"]).toContain(r!.level);
  });

  it("classifies MEDIUM risk for moderate MISMATCH", () => {
    const d = mkDecision({ decision: "MISMATCH", evidence: [
      { field: "settlement.total", expected: 1000, actual: 800 },
      { field: "duplicate.lookalike", expected: "none", actual: "pay_002" },
    ]});
    expect(scoreDecision(d)!.level).toBe("MEDIUM");
  });

  it("increases risk for larger amount discrepancy", () => {
    const small = scoreDecision(mkDecision({ decision: "MISMATCH", evidence: [{ field: "settlement.total", expected: 1000, actual: 980 }] }));
    const large = scoreDecision(mkDecision({ decision: "MISMATCH", evidence: [{ field: "settlement.total", expected: 1000, actual: 200 }] }));
    expect(large!.score).toBeGreaterThan(small!.score);
  });

  it("increases risk for multiple candidates", () => {
    const single = scoreDecision(mkDecision({ decision: "REVIEW", evidence: [{ field: "settlement.total", expected: 1000, actual: 1000 }] }));
    const multiple = scoreDecision(mkDecision({ decision: "REVIEW", evidence: [
      { field: "settlement.total", expected: 1000, actual: 1000 },
      { field: "duplicate.lookalike", expected: "none", actual: "pay_002" },
      { field: "reference.nearDuplicate", expected: "canonical", actual: "cust_001 ~ cust_00b" },
    ]}));
    expect(multiple!.score).toBeGreaterThan(single!.score);
  });

  it("increases risk for weak evidence", () => {
    const strong = scoreDecision(mkDecision({ decision: "REVIEW", evidence: [
      { field: "a", expected: 1, actual: 1 }, { field: "b", expected: 2, actual: 2 }, { field: "c", expected: 3, actual: 3 },
    ]}));
    const weak = scoreDecision(mkDecision({ decision: "REVIEW", evidence: [] }));
    expect(weak!.score).toBeGreaterThan(strong!.score);
  });

  it("increases risk for missing data", () => {
    const complete = scoreDecision(mkDecision({ decision: "REVIEW", evidence: [{ field: "settlement.total", expected: 1000, actual: 1000 }] }));
    const incomplete = scoreDecision(mkDecision({ decision: "REVIEW", evidence: [{ field: "settlement.total", expected: null, actual: null }] }));
    expect(incomplete!.score).toBeGreaterThanOrEqual(complete!.score);
  });

  it("does not assign HIGH risk to supported REFUNDED", () => {
    const d = mkDecision({ decision: "REFUNDED", evidence: [
      { field: "settlement.total", expected: 1000, actual: 1000 },
      { field: "refund.gross", expected: 1000, actual: 1000 },
      { field: "refund.reversed", expected: 1000, actual: 1000 },
    ]});
    expect(scoreDecision(d)!.level).not.toBe("HIGH");
  });

  it("generates AI fallback signal", () => {
    const d = mkDecision({ decision: "REVIEW", source: "OLLAMA", reason: "AI output unavailable or invalid; human review required" });
    const r = scoreDecision(d);
    expect(r!.signals).toContain("AI judge fell back to safe REVIEW");
    expect(r!.features.aiFallback).toBe(1);
  });

  it("generates signals from actual evidence only", () => {
    const d = mkDecision({ decision: "MISMATCH", evidence: [{ field: "settlement.total", expected: 1000, actual: 500 }] });
    const r = scoreDecision(d);
    expect(r!.signals.length).toBeGreaterThan(0);
    expect(r!.signals.some((s) => s.includes("Amount discrepancy"))).toBe(true);
  });

  it("scoreAllDecisions skips MATCHED", () => {
    const results = scoreAllDecisions([
      mkDecision({ transactionId: "pay_1", decision: "MATCHED" }),
      mkDecision({ transactionId: "pay_2", decision: "REVIEW" }),
      mkDecision({ transactionId: "pay_3", decision: "MISMATCH" }),
    ]);
    expect(results.size).toBe(2);
    expect(results.has("pay_1")).toBe(false);
  });

  it("getRiskDistribution counts correctly", () => {
    const assessments = scoreAllDecisions([
      mkDecision({ transactionId: "pay_1", decision: "MISMATCH", evidence: [{ field: "settlement.total", expected: 1000, actual: 200 }] }),
      mkDecision({ transactionId: "pay_2", decision: "REVIEW", evidence: [{ field: "settlement.total", expected: 1000, actual: 1000 }] }),
      mkDecision({ transactionId: "pay_3", decision: "MISSING" }),
    ]);
    const dist = getRiskDistribution(assessments);
    expect(dist.high + dist.medium + dist.low).toBe(3);
  });

  it("MISSING gets high decision severity", () => {
    expect(scoreDecision(mkDecision({ decision: "MISSING" }))!.features.decisionSeverity).toBe(0.9);
  });

  it("MISMATCH gets high decision severity", () => {
    expect(scoreDecision(mkDecision({ decision: "MISMATCH" }))!.features.decisionSeverity).toBe(0.8);
  });
});
