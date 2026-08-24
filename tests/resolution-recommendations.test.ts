import { describe, expect, it } from "vitest";
import { recommendResolution, recommendAllResolutions, getResolutionDistribution } from "../lib/resolution/resolutionRecommendations";
import type { DecisionResult } from "../lib/types";

function mkDecision(patch: Partial<DecisionResult> = {}): DecisionResult {
  return { transactionId: "pay_001", decision: "REVIEW", confidence: 0.5, reason: "test", evidence: [], matchedRecordId: null, source: "DETERMINISTIC", ...patch };
}

describe("resolutionRecommendations", () => {
  it("returns null for MATCHED", () => {
    expect(recommendResolution(mkDecision({ decision: "MATCHED" }))).toBeNull();
  });

  it("MISMATCH -> settlement investigation", () => {
    const d = mkDecision({ decision: "MISMATCH", evidence: [{ field: "settlement.total", expected: 1000, actual: 800 }] });
    const r = recommendResolution(d)!;
    expect(r.action).toBe("Investigate settlement discrepancy");
    expect(r.title).toBe("Settlement Discrepancy");
    expect(r.steps.length).toBeGreaterThanOrEqual(3);
  });

  it("MISSING -> settlement verification", () => {
    const r = recommendResolution(mkDecision({ decision: "MISSING" }))!;
    expect(r.action).toBe("Verify missing settlement");
    expect(r.title).toBe("Missing Settlement");
    expect(r.steps.length).toBeGreaterThanOrEqual(3);
  });

  it("REVIEW -> manual investigation", () => {
    const r = recommendResolution(mkDecision({ decision: "REVIEW" }))!;
    expect(r.action).toBe("Perform manual investigation");
    expect(r.title).toBe("Ambiguous Case");
  });

  it("REFUNDED -> refund lifecycle verification", () => {
    const r = recommendResolution(mkDecision({ decision: "REFUNDED" }))!;
    expect(r.action).toBe("Verify refund lifecycle");
    expect(r.rationale).toContain("refund");
  });

  it("HIGH risk -> HIGH priority", () => {
    const d = mkDecision({ decision: "MISMATCH", risk: { score: 85, level: "HIGH", signals: ["Large discrepancy"] } });
    expect(recommendResolution(d)!.priority).toBe("HIGH");
  });

  it("HIGH anomaly -> HIGH priority", () => {
    const d = mkDecision({ decision: "REVIEW", anomaly: { isAnomalous: true, anomalyScore: 80, severity: "HIGH", signals: [{ type: "DUP", severity: "HIGH", title: "Dup", explanation: "test", evidence: [] }] } });
    expect(recommendResolution(d)!.priority).toBe("HIGH");
  });

  it("AI fallback -> manual investigation", () => {
    const d = mkDecision({ decision: "REVIEW", source: "OLLAMA", reason: "AI output unavailable or invalid; human review required" });
    const r = recommendResolution(d)!;
    expect(r.action).toBe("Manual investigation required");
    expect(r.rationale).toContain("AI assistance was unavailable");
  });

  it("is deterministic", () => {
    const d = mkDecision({ decision: "MISMATCH", evidence: [{ field: "settlement.total", expected: 1000, actual: 500 }] });
    expect(recommendResolution(d)).toEqual(recommendResolution(d));
  });

  it("does not invent IDs", () => {
    const r = recommendResolution(mkDecision({ decision: "MISMATCH" }))!;
    const allText = r.rationale + r.steps.map((s) => s.action).join(" ");
    expect(allText).not.toContain("pay_");
    expect(allText).not.toContain("stl_");
  });

  it("does not make unsupported causal claims", () => {
    const r = recommendResolution(mkDecision({ decision: "MISMATCH" }))!;
    const allText = (r.rationale + r.steps.map((s) => s.action).join(" ")).toLowerCase();
    expect(allText).not.toContain("fraud");
    expect(allText).not.toContain("overcharged");
  });

  it("handles empty evidence safely", () => {
    expect(() => recommendResolution(mkDecision({ decision: "REVIEW", evidence: [] }))).not.toThrow();
  });

  it("steps are non-autonomous", () => {
    for (const dec of ["MISMATCH", "MISSING", "REVIEW", "REFUNDED"] as const) {
      const r = recommendResolution(mkDecision({ decision: dec }))!;
      const allText = r.steps.map((s) => s.action).join(" ").toLowerCase();
      expect(allText).not.toContain("auto-resolve");
      expect(allText).not.toContain("execute payment");
    }
  });

  it("recommendAllResolutions skips MATCHED", () => {
    const results = recommendAllResolutions([
      mkDecision({ transactionId: "pay_1", decision: "MATCHED" }),
      mkDecision({ transactionId: "pay_2", decision: "REVIEW" }),
    ]);
    expect(results.size).toBe(1);
    expect(results.has("pay_1")).toBe(false);
  });

  it("getResolutionDistribution counts correctly", () => {
    const recs = recommendAllResolutions([
      mkDecision({ transactionId: "pay_1", decision: "MISMATCH", risk: { score: 80, level: "HIGH", signals: [] } }),
      mkDecision({ transactionId: "pay_2", decision: "REVIEW" }),
      mkDecision({ transactionId: "pay_3", decision: "MISSING" }),
    ]);
    const dist = getResolutionDistribution(recs);
    expect(dist.high + dist.medium + dist.low).toBe(3);
  });

  it("existing decision behavior unchanged", () => {
    const d = mkDecision({ decision: "REVIEW", confidence: 0.45, reason: "Ambiguity detected" });
    recommendResolution(d);
    expect(d.decision).toBe("REVIEW");
    expect(d.confidence).toBe(0.45);
  });
});
