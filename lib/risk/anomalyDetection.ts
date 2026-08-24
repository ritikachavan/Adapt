/**
 * ADAPT — Deterministic Anomaly & Pattern Intelligence.
 *
 * Detects unusual patterns in reconciliation evidence. This is NOT a risk score.
 * Risk = how urgently to investigate. Anomaly = what unusual pattern exists.
 *
 * Pure deterministic, explainable, evidence-backed. No external APIs.
 */

import type { DecisionResult, EvidenceItem } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnomalySeverity = "HIGH" | "MEDIUM" | "LOW";

export interface AnomalySignal {
  type: string;
  severity: AnomalySeverity;
  title: string;
  explanation: string;
  evidence: string[];
}

export interface AnomalyAnalysis {
  isAnomalous: boolean;
  anomalyScore: number;
  severity: AnomalySeverity | null;
  signals: AnomalySignal[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findEvidence(ev: EvidenceItem[], field: string): EvidenceItem | undefined {
  return ev.find((e) => e.field === field);
}

function numVal(v: number | string | null | undefined): number | null {
  return typeof v === "number" ? v : null;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}


// ---------------------------------------------------------------------------
// Individual anomaly detectors
// ---------------------------------------------------------------------------

function detectAmountAnomalies(decision: DecisionResult): AnomalySignal[] {
  const signals: AnomalySignal[] = [];
  const ev = decision.evidence;

  const stl = findEvidence(ev, "settlement.total");
  if (stl) {
    const expected = numVal(stl.expected);
    const actual = numVal(stl.actual);
    if (expected !== null && actual !== null && expected > 0) {
      const diff = Math.abs(expected - actual);
      const pct = diff / expected;
      if (pct > 0.1) {
        signals.push({
          type: "AMOUNT_DISCREPANCY",
          severity: pct > 0.3 ? "HIGH" : pct > 0.15 ? "MEDIUM" : "LOW",
          title: "Settlement discrepancy",
          explanation: `Expected: \u20B9${fmt(expected)}, Actual: \u20B9${fmt(actual)}, Diff: \u20B9${fmt(diff)} (${Math.round(pct * 100)}%)`,
          evidence: [`settlement.total expected ${fmt(expected)}, saw ${fmt(actual)}`],
        });
      }
    }
  }

  const ovp = findEvidence(ev, "amount.orderVsPayment");
  if (ovp) {
    const expected = numVal(ovp.expected);
    const actual = numVal(ovp.actual);
    if (expected !== null && actual !== null && expected > 0) {
      const diff = Math.abs(expected - actual);
      const pct = diff / expected;
      if (pct > 0.05) {
        signals.push({
          type: "ORDER_PAYMENT_MISMATCH",
          severity: pct > 0.2 ? "HIGH" : "MEDIUM",
          title: "Order-payment mismatch",
          explanation: `Order: \u20B9${fmt(expected)}, Payment: \u20B9${fmt(actual)}, Diff: \u20B9${fmt(diff)}`,
          evidence: [`amount.orderVsPayment expected ${fmt(expected)}, saw ${fmt(actual)}`],
        });
      }
    }
  }

  return signals;
}

function detectDuplicateAnomalies(decision: DecisionResult): AnomalySignal[] {
  const signals: AnomalySignal[] = [];
  const ev = decision.evidence;

  const dup = findEvidence(ev, "duplicate.lookalike");
  if (dup) {
    signals.push({
      type: "DUPLICATE_CANDIDATE",
      severity: "HIGH",
      title: "Duplicate candidate detected",
      explanation: `Lookalike transaction found: ${dup.actual ?? "unknown"}. Same customer and amount within time window.`,
      evidence: [`duplicate.lookalike: ${dup.detail ?? `expected ${dup.expected}, saw ${dup.actual}`}`],
    });
  }

  const nearDup = findEvidence(ev, "reference.nearDuplicate");
  if (nearDup) {
    signals.push({
      type: "NEAR_DUPLICATE_REFERENCE",
      severity: "MEDIUM",
      title: "Near-duplicate reference",
      explanation: `One-character-away reference found: ${nearDup.actual ?? "unknown"}. May indicate data entry error.`,
      evidence: [`reference.nearDuplicate: ${nearDup.detail ?? `expected ${nearDup.expected}, saw ${nearDup.actual}`}`],
    });
  }

  const stlCount = findEvidence(ev, "settlement.records");
  if (stlCount) {
    const count = numVal(stlCount.actual);
    if (count !== null && count > 1) {
      signals.push({
        type: "MULTIPLE_SETTLEMENTS",
        severity: count > 2 ? "HIGH" : "MEDIUM",
        title: "Multiple settlement records",
        explanation: `${count} settlement records for one payment. May indicate split settlements or duplication.`,
        evidence: [`settlement.records: ${count} found`],
      });
    }
  }

  return signals;
}

function detectTemporalAnomalies(decision: DecisionResult): AnomalySignal[] {
  const signals: AnomalySignal[] = [];
  const ev = decision.evidence;

  const delay = findEvidence(ev, "settlement.delayDays");
  if (delay) {
    const days = numVal(delay.actual);
    if (days !== null && days > 7) {
      signals.push({
        type: "DELAYED_SETTLEMENT",
        severity: days > 30 ? "HIGH" : days > 14 ? "MEDIUM" : "LOW",
        title: "Delayed settlement",
        explanation: `Settlement arrived ${days} days late. Normal window is 7 days.`,
        evidence: [`settlement.delayDays: ${days} days`],
      });
    }
  }

  return signals;
}

function detectDataQualityAnomalies(decision: DecisionResult): AnomalySignal[] {
  const signals: AnomalySignal[] = [];
  const ev = decision.evidence;

  const nullFields = ev.filter((e) => e.expected === null || e.actual === null);
  if (nullFields.length > 0 && ev.length > 0) {
    const ratio = nullFields.length / ev.length;
    if (ratio >= 0.3) {
      signals.push({
        type: "INCOMPLETE_EVIDENCE",
        severity: ratio > 0.6 ? "HIGH" : "MEDIUM",
        title: "Incomplete evidence fields",
        explanation: `${nullFields.length} of ${ev.length} evidence fields have missing values.`,
        evidence: nullFields.map((e) => `${e.field}: missing value`),
      });
    }
  }

  const conflicts = ev.filter((e) => e.expected !== null && e.actual !== null && e.expected !== e.actual);
  if (conflicts.length >= 2) {
    signals.push({
      type: "CONFLICTING_EVIDENCE",
      severity: conflicts.length >= 3 ? "HIGH" : "MEDIUM",
      title: "Conflicting evidence fields",
      explanation: `${conflicts.length} evidence fields show mismatches.`,
      evidence: conflicts.map((e) => `${e.field}: expected ${e.expected}, saw ${e.actual}`),
    });
  }

  return signals;
}

function detectDecisionAnomalies(decision: DecisionResult): AnomalySignal[] {
  const signals: AnomalySignal[] = [];

  if (decision.decision === "MISSING") {
    signals.push({
      type: "MISSING_SETTLEMENT",
      severity: "HIGH",
      title: "Missing settlement record",
      explanation: "Payment captured but no settlement record exists. May indicate pipeline failure.",
      evidence: ["No settlement references this paymentId"],
    });
  }

  if (decision.decision === "MISMATCH") {
    const stl = findEvidence(decision.evidence, "settlement.total");
    if (stl) {
      const expected = numVal(stl.expected);
      const actual = numVal(stl.actual);
      if (expected !== null && actual !== null) {
        const diff = Math.abs(expected - actual);
        signals.push({
          type: "AMOUNT_MISMATCH",
          severity: diff > expected * 0.2 ? "HIGH" : "MEDIUM",
          title: "Amount mismatch",
          explanation: `Settlement \u20B9${fmt(actual)} vs payment \u20B9${fmt(expected)}. Unexplained diff: \u20B9${fmt(diff)}.`,
          evidence: [`settlement.total: expected ${fmt(expected)}, saw ${fmt(actual)}`],
        });
      }
    }
  }

  if (decision.source === "OLLAMA" && decision.decision === "REVIEW" && decision.reason.includes("unavailable or invalid")) {
    signals.push({
      type: "AI_FALLBACK",
      severity: "MEDIUM",
      title: "AI judge fallback",
      explanation: "AI judge could not reach a verdict. Fell back to safe REVIEW.",
      evidence: [`AI reason: ${decision.reason}`],
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const SEVERITY_SCORE: Record<AnomalySeverity, number> = { HIGH: 35, MEDIUM: 20, LOW: 10 };

function calculateAnomalyScore(signals: AnomalySignal[]): number {
  if (signals.length === 0) return 0;
  let score = 0;
  for (const s of signals) {
    score += SEVERITY_SCORE[s.severity];
  }
  return Math.min(100, score);
}

function classifySeverity(score: number): AnomalySeverity | null {
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  if (score > 0) return "LOW";
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a single decision for anomalies. Deterministic: same input -> same output.
 * Returns null for MATCHED decisions.
 */
export function analyzeDecision(decision: DecisionResult): AnomalyAnalysis | null {
  if (decision.decision === "MATCHED") return null;

  const signals: AnomalySignal[] = [
    ...detectAmountAnomalies(decision),
    ...detectDuplicateAnomalies(decision),
    ...detectTemporalAnomalies(decision),
    ...detectDataQualityAnomalies(decision),
    ...detectDecisionAnomalies(decision),
  ];

  const anomalyScore = calculateAnomalyScore(signals);
  const severity = classifySeverity(anomalyScore);

  return { isAnomalous: signals.length > 0, anomalyScore, severity, signals };
}

/**
 * Analyze all decisions. Returns a map of transactionId -> AnomalyAnalysis.
 */
export function analyzeAllDecisions(decisions: DecisionResult[]): Map<string, AnomalyAnalysis> {
  const results = new Map<string, AnomalyAnalysis>();
  for (const d of decisions) {
    const analysis = analyzeDecision(d);
    if (analysis) results.set(d.transactionId, analysis);
  }
  return results;
}

/**
 * Get anomaly distribution counts.
 */
export function getAnomalyDistribution(analyses: Map<string, AnomalyAnalysis>): {
  total: number; high: number; medium: number; low: number; nonAnomalous: number;
} {
  let high = 0; let medium = 0; let low = 0; let nonAnomalous = 0;
  for (const a of analyses.values()) {
    if (!a.isAnomalous) { nonAnomalous++; continue; }
    if (a.severity === "HIGH") high++;
    else if (a.severity === "MEDIUM") medium++;
    else low++;
  }
  return { total: high + medium + low, high, medium, low, nonAnomalous };
}
