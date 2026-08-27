/**
 * ADAPT — Explainable Risk Scoring for Reconciliation Exceptions.
 *
 * This module implements a lightweight, deterministic, feature-based risk model.
 * It does NOT make reconciliation decisions. It only prioritizes which exceptions
 * a human should investigate first.
 *
 * Architecture: Deterministic Engine -> Risk Scoring -> AI Judge -> Human Review
 *
 * The score is always 0-100, deterministic, and explainable via human-readable signals.
 */

import type { DecisionResult, EvidenceItem } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskFeatures {
  /** Normalized amount discrepancy (0-1). 0 = no discrepancy, 1 = large gap. */
  amountDiscrepancy: number;
  /** Number of candidate records. More candidates = more ambiguity. */
  candidateCount: number;
  /** Strength of deterministic evidence (0-1). 1 = strong, 0 = weak. */
  evidenceStrength: number;
  /** Data completeness (0-1). 1 = complete, 0 = missing fields. */
  dataCompleteness: number;
  /** Temporal consistency (0-1). 1 = consistent, 0 = suspicious gaps. */
  temporalConsistency: number;
  /** Decision severity (0-1). Higher for MISMATCH/MISSING than REVIEW. */
  decisionSeverity: number;
  /** AI fallback signal (0 or 1). 1 = AI fell back to safe REVIEW. */
  aiFallback: number;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  features: RiskFeatures;
  signals: string[];
}

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

function extractFeatures(decision: DecisionResult): RiskFeatures {
  const ev = decision.evidence;

  // 1. Amount discrepancy: look for settlement.total evidence with numeric values
  let amountDiscrepancy = 0;
  const stlEvidence = ev.find((e) => e.field === "settlement.total" && typeof e.expected === "number" && typeof e.actual === "number");
  if (stlEvidence) {
    const expected = stlEvidence.expected as number;
    const actual = stlEvidence.actual as number;
    if (expected > 0) {
      amountDiscrepancy = Math.min(1, Math.abs(expected - actual) / expected);
    }
  }
  // Also check order-vs-payment discrepancy
  const orderEvidence = ev.find((e) => e.field === "amount.orderVsPayment" && typeof e.expected === "number" && typeof e.actual === "number");
  if (orderEvidence) {
    const expected = orderEvidence.expected as number;
    const actual = orderEvidence.actual as number;
    if (expected > 0) {
      amountDiscrepancy = Math.max(amountDiscrepancy, Math.min(1, Math.abs(expected - actual) / expected));
    }
  }

  // 2. Candidate ambiguity: count candidate-related evidence fields
  let candidateCount = 0;
  const hasDuplicate = ev.some((e) => e.field === "duplicate.lookalike");
  const hasNearDup = ev.some((e) => e.field === "reference.nearDuplicate");
  if (hasDuplicate) candidateCount += 1;
  if (hasNearDup) candidateCount += 1;
  // Settlement count from evidence detail
  const stlCountEv = ev.find((e) => e.field === "settlement.records" && typeof e.actual === "number");
  if (stlCountEv && (stlCountEv.actual as number) > 1) candidateCount += stlCountEv.actual as number;
  // If matchedRecordId has "+" it means multiple settlements
  if (decision.matchedRecordId && decision.matchedRecordId.includes("+")) {
    candidateCount = Math.max(candidateCount, decision.matchedRecordId.split("+").length);
  }

  // 3. Evidence strength: more evidence with matching values = stronger
  let evidenceStrength = 0;
  if (ev.length >= 3) evidenceStrength = 0.8;
  else if (ev.length === 2) evidenceStrength = 0.5;
  else if (ev.length === 1) evidenceStrength = 0.3;
  // Matching expected/actual reduces risk
  const matchingEvidence = ev.filter((e) => e.expected !== null && e.expected === e.actual).length;
  if (ev.length > 0) {
    evidenceStrength = Math.min(1, evidenceStrength + (matchingEvidence / ev.length) * 0.3);
  }

  // 4. Data completeness: check for null/missing expected values
  let dataCompleteness = 1;
  const nullFields = ev.filter((e) => e.expected === null || e.actual === null).length;
  if (ev.length > 0) {
    dataCompleteness = Math.max(0, 1 - (nullFields / ev.length));
  }
  // Missing order link is a completeness issue
  const hasOrderLink = ev.some((e) => e.field === "order.link");
  if (hasOrderLink) dataCompleteness = Math.min(dataCompleteness, 0.3);

  // 5. Temporal consistency: check for delay evidence
  let temporalConsistency = 1;
  const hasDelay = ev.some((e) => e.field === "settlement.delayDays");
  if (hasDelay) temporalConsistency = 0.6;
  const hasLateSettlement = ev.some((e) => e.field === "settlement.delayDays" && typeof e.actual === "number" && (e.actual as number) > 14);
  if (hasLateSettlement) temporalConsistency = 0.3;

  // 6. Decision severity
  const severityMap: Record<string, number> = {
    MATCHED: 0,
    REFUNDED: 0.1,
    REVIEW: 0.5,
    MISMATCH: 0.8,
    MISSING: 0.9,
  };
  const decisionSeverity = severityMap[decision.decision] ?? 0.5;

  // 7. AI fallback
  const aiFallback = (decision.source === "OLLAMA" || decision.source === "GROQ" || decision.source === "FALLBACK") && decision.reason.includes("unavailable or invalid") ? 1 : 0;

  return {
    amountDiscrepancy,
    candidateCount,
    evidenceStrength,
    dataCompleteness,
    temporalConsistency,
    decisionSeverity,
    aiFallback,
  };
}

// ---------------------------------------------------------------------------
// Scoring weights (transparent, explainable)
// ---------------------------------------------------------------------------

const WEIGHTS = {
  amountDiscrepancy: 30,
  candidateAmbiguity: 20,
  weakEvidence: 15,
  dataQuality: 10,
  temporalInconsistency: 5,
  decisionSeverity: 15,
  aiFallback: 5,
} as const;

function calculateScore(features: RiskFeatures): number {
  const raw =
    WEIGHTS.amountDiscrepancy * features.amountDiscrepancy +
    WEIGHTS.candidateAmbiguity * Math.min(1, features.candidateCount / 3) +
    WEIGHTS.weakEvidence * (1 - features.evidenceStrength) +
    WEIGHTS.dataQuality * (1 - features.dataCompleteness) +
    WEIGHTS.temporalInconsistency * (1 - features.temporalConsistency) +
    WEIGHTS.decisionSeverity * features.decisionSeverity +
    WEIGHTS.aiFallback * features.aiFallback;

  return Math.round(Math.max(0, Math.min(100, raw)));
}

function classifyLevel(score: number): RiskLevel {
  if (score >= 70) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

// ---------------------------------------------------------------------------
// Signal generation (explainable)
// ---------------------------------------------------------------------------

function generateSignals(decision: DecisionResult, features: RiskFeatures): string[] {
  const signals: string[] = [];

  if (features.amountDiscrepancy > 0.05) {
    const pct = Math.round(features.amountDiscrepancy * 100);
    signals.push(`Amount discrepancy: ${pct}%`);
  }

  if (features.candidateCount >= 2) {
    signals.push(`Multiple candidate records (${features.candidateCount})`);
  } else if (features.candidateCount === 1) {
    const hasDup = decision.evidence.some((e) => e.field === "duplicate.lookalike");
    const hasNearDup = decision.evidence.some((e) => e.field === "reference.nearDuplicate");
    if (hasDup) signals.push("Possible duplicate transaction detected");
    if (hasNearDup) signals.push("Near-duplicate reference found");
  }

  if (features.evidenceStrength < 0.4) {
    signals.push("Weak deterministic evidence");
  }

  if (features.dataCompleteness < 0.7) {
    signals.push("Incomplete data fields");
  }

  if (features.temporalConsistency < 0.5) {
    signals.push("Suspicious temporal gap");
  }

  if (decision.decision === "MISMATCH") {
    signals.push("Amount mismatch requires investigation");
  } else if (decision.decision === "MISSING") {
    signals.push("No settlement record found");
  }

  if (features.aiFallback === 1) {
    signals.push("AI judge fell back to safe REVIEW");
  }

  if (decision.decision === "REFUNDED" && features.amountDiscrepancy < 0.05) {
    signals.push("Supported refund lifecycle");
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score a single decision. Deterministic: same input always produces same output.
 * Only scores non-MATCHED decisions. MATCHED decisions get null.
 */
export function scoreDecision(decision: DecisionResult): RiskAssessment | null {
  if (decision.decision === "MATCHED") return null;

  const features = extractFeatures(decision);
  const score = calculateScore(features);
  const level = classifyLevel(score);
  const signals = generateSignals(decision, features);

  return { score, level, features, signals };
}

/**
 * Score all decisions in a reconciliation result.
 * Returns a map of transactionId -> RiskAssessment.
 */
export function scoreAllDecisions(decisions: DecisionResult[]): Map<string, RiskAssessment> {
  const results = new Map<string, RiskAssessment>();
  for (const d of decisions) {
    const assessment = scoreDecision(d);
    if (assessment) results.set(d.transactionId, assessment);
  }
  return results;
}

/**
 * Get risk distribution counts from scored decisions.
 */
export function getRiskDistribution(assessments: Map<string, RiskAssessment>): { high: number; medium: number; low: number } {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const a of assessments.values()) {
    if (a.level === "HIGH") high++;
    else if (a.level === "MEDIUM") medium++;
    else low++;
  }
  return { high, medium, low };
}

