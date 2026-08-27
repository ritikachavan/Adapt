/**
 * ADAPT — Resolution Intelligence.
 *
 * Generates deterministic, evidence-grounded investigation recommendations
 * for reconciliation exceptions. Does NOT make autonomous financial decisions.
 * Human approval is always required.
 */

import type { DecisionResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResolutionPriority = "HIGH" | "MEDIUM" | "LOW";

export interface ResolutionStep {
  order: number;
  action: string;
}

export interface ResolutionRecommendation {
  priority: ResolutionPriority;
  action: string;
  title: string;
  rationale: string;
  steps: ResolutionStep[];
  supportingSignals: string[];
}

// ---------------------------------------------------------------------------
// Priority derivation from existing risk/anomaly data
// ---------------------------------------------------------------------------

function derivePriority(decision: DecisionResult): ResolutionPriority {
  const riskLevel = decision.risk?.level;
  const anomalySeverity = decision.anomaly?.severity;
  if (riskLevel === "HIGH" || anomalySeverity === "HIGH") return "HIGH";
  if (riskLevel === "MEDIUM" || anomalySeverity === "MEDIUM") return "MEDIUM";
  return "LOW";
}

// ---------------------------------------------------------------------------
// Supporting signals from risk + anomaly
// ---------------------------------------------------------------------------

function collectSupportingSignals(decision: DecisionResult): string[] {
  const signals: string[] = [];
  if (decision.risk?.signals) {
    for (const s of decision.risk.signals) signals.push(s);
  }
  if (decision.anomaly?.signals) {
    for (const s of decision.anomaly.signals) {
      if (!signals.includes(s.title)) signals.push(s.title);
    }
  }
  return signals.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Decision-specific recommendations
// ---------------------------------------------------------------------------

function mismatchRecommendation(decision: DecisionResult): ResolutionRecommendation {
  const ev = decision.evidence;
  const hasSettlement = ev.some((e) => e.field === "settlement.total");
  const hasFee = ev.some((e) => e.field === "gateway.fee");

  const rationale = hasSettlement
    ? "Expected and actual settlement values differ. Investigate the discrepancy to determine whether it is a legitimate fee, adjustment, or data error."
    : "This transaction was flagged as a mismatch. Review the available evidence to determine the cause.";

  const steps: ResolutionStep[] = [
    { order: 1, action: "Verify settlement reference and settlement record" },
    { order: 2, action: "Compare expected vs actual settlement amounts" },
  ];
  if (hasFee) steps.push({ order: 3, action: "Confirm whether the difference is a legitimate gateway fee" });
  steps.push({ order: steps.length + 1, action: "Check gateway/batch records for adjustments" });
  steps.push({ order: steps.length + 1, action: "Escalate to finance team if unresolved" });

  return {
    priority: derivePriority(decision),
    action: "Investigate settlement discrepancy",
    title: "Settlement Discrepancy",
    rationale,
    steps,
    supportingSignals: collectSupportingSignals(decision),
  };
}

function missingRecommendation(decision: DecisionResult): ResolutionRecommendation {
  return {
    priority: derivePriority(decision),
    action: "Verify missing settlement",
    title: "Missing Settlement",
    rationale: "Payment was captured but no settlement record was found. Investigate whether the settlement was lost, delayed, or never initiated.",
    steps: [
      { order: 1, action: "Check settlement ingestion pipeline for errors" },
      { order: 2, action: "Verify whether the payment actually settled with the gateway" },
      { order: 3, action: "Check gateway/batch records for this payment" },
      { order: 4, action: "Confirm settlement reference exists" },
    ],
    supportingSignals: collectSupportingSignals(decision),
  };
}

function reviewRecommendation(decision: DecisionResult): ResolutionRecommendation {
  const ev = decision.evidence;
  const hasDuplicate = ev.some((e) => e.field === "duplicate.lookalike");
  const hasNearDup = ev.some((e) => e.field === "reference.nearDuplicate");

  const rationaleParts: string[] = [];
  if (hasDuplicate) rationaleParts.push("a possible duplicate transaction was identified");
  if (hasNearDup) rationaleParts.push("a near-duplicate reference was found");
  if (rationaleParts.length === 0) rationaleParts.push("the deterministic engine could not reach a confident verdict");

  const isAiFallback = (decision.source === "OLLAMA" || decision.source === "GROQ" || decision.source === "FALLBACK") && decision.reason.includes("unavailable or invalid");

  const steps: ResolutionStep[] = [
    { order: 1, action: "Review all candidate records" },
    { order: 2, action: "Compare available evidence fields" },
  ];
  if (hasDuplicate) steps.push({ order: 3, action: "Determine whether the duplicate is a legitimate double-order or a data error" });
  steps.push({ order: steps.length + 1, action: "Resolve ambiguity and confirm the correct record" });
  steps.push({ order: steps.length + 1, action: "Record your decision with explanation" });

  return {
    priority: derivePriority(decision),
    action: isAiFallback ? "Manual investigation required" : "Perform manual investigation",
    title: isAiFallback ? "AI Unavailable \u2014 Manual Review" : "Ambiguous Case",
    rationale: isAiFallback
      ? `AI assistance was unavailable or invalid for this case. The decision was safely retained as REVIEW. ${rationaleParts.join("; ")}.`
      : `The deterministic engine identified ambiguity: ${rationaleParts.join("; ")}. Manual investigation is required.`,
    steps,
    supportingSignals: collectSupportingSignals(decision),
  };
}

function refundedRecommendation(decision: DecisionResult): ResolutionRecommendation {
  return {
    priority: derivePriority(decision),
    action: "Verify refund lifecycle",
    title: "Refund Verification",
    rationale: "This transaction is marked as refunded. Verify that the refund lifecycle is complete and the amounts are correct.",
    steps: [
      { order: 1, action: "Confirm refund reference and amount" },
      { order: 2, action: "Verify refund timing and status" },
      { order: 3, action: "Confirm refund lifecycle is complete" },
    ],
    supportingSignals: collectSupportingSignals(decision),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a resolution recommendation for a decision.
 * Returns null for MATCHED decisions (no investigation needed).
 * Deterministic: same input always produces same output.
 */
export function recommendResolution(decision: DecisionResult): ResolutionRecommendation | null {
  if (decision.decision === "MATCHED") return null;
  switch (decision.decision) {
    case "MISMATCH": return mismatchRecommendation(decision);
    case "MISSING": return missingRecommendation(decision);
    case "REVIEW": return reviewRecommendation(decision);
    case "REFUNDED": return refundedRecommendation(decision);
    default: return null;
  }
}

/**
 * Generate recommendations for all decisions.
 * Returns a map of transactionId -> ResolutionRecommendation.
 */
export function recommendAllResolutions(decisions: DecisionResult[]): Map<string, ResolutionRecommendation> {
  const results = new Map<string, ResolutionRecommendation>();
  for (const d of decisions) {
    const rec = recommendResolution(d);
    if (rec) results.set(d.transactionId, rec);
  }
  return results;
}

/**
 * Get resolution priority distribution.
 */
export function getResolutionDistribution(recommendations: Map<string, ResolutionRecommendation>): {
  high: number; medium: number; low: number;
} {
  let high = 0; let medium = 0; let low = 0;
  for (const r of recommendations.values()) {
    if (r.priority === "HIGH") high++;
    else if (r.priority === "MEDIUM") medium++;
    else low++;
  }
  return { high, medium, low };
}
