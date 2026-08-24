import { describe, expect, it } from "vitest";
import { analyzeDecision, analyzeAllDecisions, getAnomalyDistribution } from "../lib/risk/anomalyDetection";
import type { DecisionResult } from "../lib/types";

function mkDecision(patch: Partial<DecisionResult> = {}): DecisionResult {
  return { transactionId: "pay_001", decision: "REVIEW", confidence: 0.5, reason: "test", evidence: [], matchedRecordId: null, source: "DETERMINISTIC", ...patch };
}

describe("anomalyDetection", () => {
  it("returns null for MATCHED decisions", () => {
    expect(analyzeDecision(mkDecision({ decision: "MATCHED" }))).toBeNull();
  });

  it("returns analysis for non-MATCHED decisions", () => {
    const r = analyzeDecision(mkDecision({ decision: "REVIEW" }));
    expect(r).not.toBeNull();
    expect(r!.anomalyScore).toBeGreaterThanOrEqual(0);
    expect(r!.anomalyScore).toBeLessThanOrEqual(100);
  });

  it("is deterministic", () => {
    const d = mkDecision({ decision: "MISMATCH", evidence: [{ field: "settlement.total", expected: 1000, actual: 500 }] });
    expect(analyzeDecision(d)).toEqual(analyzeDecision(d));
  });

  it("detects large amount discrepancy", () => {
    const d = mkDecision({ decision: "MISMATCH", evidence: [{ field: "settlement.total", expected: 10000, actual: 2000 }] });
    const r = analyzeDecision(d)!;
    expect(r.isAnomalous).toBe(true);
    expect(r.signals.some((s) => s.type === "AMOUNT_DISCREPANCY")).toBe(true);
  });

  it("detects duplicate candidate", () => {
    const d = mkDecision({ decision: "REVIEW", evidence: [{ field: "duplicate.lookalike", expected: "none", actual: "pay_002" }] });
    const r = analyzeDecision(d)!;
    expect(r.isAnomalous).toBe(true);
    expect(r.signals.some((s) => s.type === "DUPLICATE_CANDIDATE")).toBe(true);
  });

  it("detects near-duplicate reference", () => {
    const d = mkDecision({ decision: "REVIEW", evidence: [{ field: "reference.nearDuplicate", expected: "cust_001", actual: "cust_00b" }] });
    const r = analyzeDecision(d)!;
    expect(r.isAnomalous).toBe(true);
    expect(r.signals.some((s) => s.type === "NEAR_DUPLICATE_REFERENCE")).toBe(true);
  });

  it("detects delayed settlement", () => {
    const d = mkDecision({ decision: "REVIEW", evidence: [{ field: "settlement.delayDays", expected: 7, actual: 21 }] });
    const r = analyzeDecision(d)!;
    expect(r.isAnomalous).toBe(true);
    expect(r.signals.some((s) => s.type === "DELAYED_SETTLEMENT")).toBe(true);
  });

  it("detects incomplete evidence", () => {
    const d = mkDecision({ decision: "REVIEW", evidence: [
      { field: "a", expected: null, actual: null },
      { field: "b", expected: null, actual: 100 },
      { field: "c", expected: 1, actual: 1 },
    ]});
    const r = analyzeDecision(d)!;
    expect(r.isAnomalous).toBe(true);
    expect(r.signals.some((s) => s.type === "INCOMPLETE_EVIDENCE")).toBe(true);
  });

  it("detects multiple signals", () => {
    const d = mkDecision({ decision: "MISMATCH", evidence: [
      { field: "settlement.total", expected: 10000, actual: 2000 },
      { field: "duplicate.lookalike", expected: "none", actual: "pay_002" },
      { field: "settlement.delayDays", expected: 7, actual: 30 },
    ]});
    const r = analyzeDecision(d)!;
    expect(r.signals.length).toBeGreaterThanOrEqual(3);
    expect(r.anomalyScore).toBeGreaterThanOrEqual(60);
  });

  it("classifies severity", () => {
    const low = analyzeDecision(mkDecision({ decision: "REVIEW", evidence: [{ field: "settlement.total", expected: 1000, actual: 850 }] }));
    expect(low!.severity).toBe("LOW");
    const high = analyzeDecision(mkDecision({ decision: "MISSING", evidence: [{ field: "settlement.total", expected: 10000, actual: 2000 }] }));
    expect(high!.severity).toBe("HIGH");
  });

  it("score always 0-100", () => {
    const d = mkDecision({ decision: "MISMATCH", evidence: [
      { field: "settlement.total", expected: 10000, actual: 100 },
      { field: "duplicate.lookalike", expected: "none", actual: "pay_002" },
      { field: "reference.nearDuplicate", expected: "a", actual: "b" },
      { field: "settlement.delayDays", expected: 7, actual: 90 },
      { field: "a", expected: null, actual: null },
      { field: "b", expected: null, actual: null },
      { field: "c", expected: 1, actual: 2 },
      { field: "d", expected: 3, actual: 4 },
    ]});
    const r = analyzeDecision(d)!;
    expect(r.anomalyScore).toBeGreaterThanOrEqual(0);
    expect(r.anomalyScore).toBeLessThanOrEqual(100);
  });

  it("produces evidence-backed explanations", () => {
    const d = mkDecision({ decision: "MISMATCH", evidence: [{ field: "settlement.total", expected: 5000, actual: 3000 }] });
    const r = analyzeDecision(d)!;
    for (const sig of r.signals) {
      expect(sig.explanation.length).toBeGreaterThan(0);
      expect(sig.evidence.length).toBeGreaterThan(0);
    }
  });

  it("does not invent evidence", () => {
    const d = mkDecision({ decision: "REVIEW", evidence: [] });
    const r = analyzeDecision(d)!;
    expect(r.signals.some((s) => s.type === "AMOUNT_DISCREPANCY")).toBe(false);
    expect(r.signals.some((s) => s.type === "DUPLICATE_CANDIDATE")).toBe(false);
  });

  it("MISSING produces HIGH anomaly", () => {
    const d = mkDecision({ decision: "MISSING" });
    const r = analyzeDecision(d)!;
    expect(r.isAnomalous).toBe(true);
    expect(r.signals.some((s) => s.type === "MISSING_SETTLEMENT")).toBe(true);
  });

  it("AI fallback produces anomaly signal", () => {
    const d = mkDecision({ decision: "REVIEW", source: "OLLAMA", reason: "AI output unavailable or invalid; human review required" });
    const r = analyzeDecision(d)!;
    expect(r.signals.some((s) => s.type === "AI_FALLBACK")).toBe(true);
  });

  it("empty evidence does not crash", () => {
    expect(() => analyzeDecision(mkDecision({ decision: "REVIEW", evidence: [] }))).not.toThrow();
  });

  it("malformed evidence does not crash", () => {
    expect(() => analyzeDecision(mkDecision({ decision: "REVIEW", evidence: [
      { field: "settlement.total", expected: null, actual: null },
      { field: "settlement.delayDays", expected: "not-a-number", actual: null },
    ]}))).not.toThrow();
  });

  it("analyzeAllDecisions skips MATCHED", () => {
    const results = analyzeAllDecisions([
      mkDecision({ transactionId: "pay_1", decision: "MATCHED" }),
      mkDecision({ transactionId: "pay_2", decision: "REVIEW" }),
      mkDecision({ transactionId: "pay_3", decision: "MISMATCH" }),
    ]);
    expect(results.size).toBe(2);
    expect(results.has("pay_1")).toBe(false);
  });

  it("getAnomalyDistribution counts correctly", () => {
    const analyses = analyzeAllDecisions([
      mkDecision({ transactionId: "pay_1", decision: "MISMATCH", evidence: [{ field: "settlement.total", expected: 10000, actual: 2000 }] }),
      mkDecision({ transactionId: "pay_2", decision: "REVIEW", evidence: [{ field: "settlement.total", expected: 1000, actual: 950 }] }),
      mkDecision({ transactionId: "pay_3", decision: "MISSING" }),
    ]);
    const dist = getAnomalyDistribution(analyses);
    expect(dist.high + dist.medium + dist.low + dist.nonAnomalous).toBe(3);
  });

  it("supported REFUNDED not HIGH anomaly", () => {
    const d = mkDecision({ decision: "REFUNDED", evidence: [
      { field: "settlement.total", expected: 1000, actual: 1000 },
      { field: "refund.gross", expected: 1000, actual: 1000 },
    ]});
    const r = analyzeDecision(d)!;
    expect(r.severity).not.toBe("HIGH");
  });
});
