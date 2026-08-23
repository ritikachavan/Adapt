/**
 * ADAPT — evaluation engine.
 * Compares actual reconciliation decisions against ground-truth cases.
 * Pure functions: no AI, no Ollama, no network, no database, no wall-clock time.
 *
 * Vocabulary bridge — ground truth speaks { MATCHED, UNMATCHED, REVIEW } while
 * the engine speaks { MATCHED, REFUNDED, REVIEW, MISMATCH, MISSING }. Both are
 * normalised to three canonical outcomes before any comparison:
 *   MATCHED -> resolved correctly without humans (includes REFUNDED)
 *   REVIEW  -> escalated for human / AI judgement
 *   PROBLEM -> flagged as unreconcilable (MISMATCH, MISSING; GT "UNMATCHED")
 */
import type { DecisionResult, ReconciliationDecision } from "./types";

/** All scenario labels produced by scripts/generate-data.ts. Fixed order. */
export const GROUND_TRUTH_SCENARIOS = [
  "NORMAL_MATCH",
  "REFUND",
  "REFUND_REVERSAL",
  "DUPLICATE_LOOKALIKE",
  "AMOUNT_MISMATCH",
  "NEAR_DUPLICATE_REFERENCE",
  "MISSING_SETTLEMENT",
  "GATEWAY_FEE",
  "DELAYED_SETTLEMENT",
  "SPLIT_SETTLEMENT",
] as const;

export type GroundTruthScenario = (typeof GROUND_TRUTH_SCENARIOS)[number];

/** Decision vocabulary used by ground-truth.json. */
export type GroundTruthDecision = "MATCHED" | "UNMATCHED" | "REVIEW";

/** Normalised comparison buckets shared by both vocabularies. */
export type CanonicalOutcome = "MATCHED" | "REVIEW" | "PROBLEM";

/** One row of data/ground-truth.json. */
export interface GroundTruthCase {
  caseId: string;
  orderId: string;
  paymentId: string;
  scenario: GroundTruthScenario;
  expectedDecision: GroundTruthDecision;
  expectedOutcome: string;
  reviewRequired: boolean;
  relatedOrderId: string | null;
  note: string;
}

/** A wrong decision, with everything needed to inspect it. */
export interface EvaluationError {
  caseId: string;
  transactionId: string;
  expectedDecision: GroundTruthDecision;
  actualDecision: ReconciliationDecision;
  scenario: GroundTruthScenario;
  reason: string;
}

/** Accuracy for one scenario label. */
export interface ScenarioPerformance {
  scenario: GroundTruthScenario;
  total: number;
  correct: number;
  incorrect: number;
  /** correct / total — 0 when the scenario never occurred. */
  accuracy: number;
}

/** Rows = actual decision; columns = expected canonical outcome. */
export interface ConfusionRow {
  expectedMatched: number;
  expectedReview: number;
  expectedProblem: number;
}

export interface ConfusionMatrix {
  MATCHED: ConfusionRow;
  REVIEW: ConfusionRow;
  MISMATCH: ConfusionRow;
  MISSING: ConfusionRow;
  REFUNDED: ConfusionRow;
}

export interface EvaluationTotals {
  totalCases: number;
  correctDecisions: number;
  incorrectDecisions: number;
  /** correct / total — 0 when nothing was evaluated. */
  accuracy: number;
  /** Precision of REVIEW escalation against ground-truth reviewRequired. */
  precision: number;
  /** Recall of REVIEW escalation against ground-truth reviewRequired. */
  recall: number;
  /** Share of evaluated cases the engine sent to review. */
  reviewRate: number;
  /** Share of evaluated cases the engine resolved without review. */
  autoResolutionRate: number;
  /** Decisions without a ground-truth case (excluded from metrics). */
  unmatchedTransactionCount: number;
  /** Extra decisions beyond the first for a transaction (ignored). */
  duplicateDecisionCount: number;
}

export interface EvaluationReport {
  totals: EvaluationTotals;
  confusionMatrix: ConfusionMatrix;
  errors: EvaluationError[];
  scenarioPerformance: ScenarioPerformance[];
  /** transactionIds skipped because no ground-truth case matched them. */
  unmatchedTransactionIds: string[];
  /** transactionIds of ignored repeat decisions, in encounter order. */
  duplicateTransactionIds: string[];
}

export interface EvaluationInput {
  groundTruth: GroundTruthCase[];
  decisions: DecisionResult[];
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------
function expectedToCanonical(d: GroundTruthDecision): CanonicalOutcome {
  if (d === "MATCHED") return "MATCHED";
  if (d === "REVIEW") return "REVIEW";
  return "PROBLEM";
}

function actualToCanonical(d: ReconciliationDecision): CanonicalOutcome {
  if (d === "MATCHED" || d === "REFUNDED") return "MATCHED";
  if (d === "REVIEW") return "REVIEW";
  return "PROBLEM";
}

function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Evaluate decisions against ground truth.
 * Join rule: decision.transactionId <-> groundTruth.paymentId.
 * First decision wins per transaction; later repeats are counted and ignored.
 * Decisions without a ground-truth case are reported, never scored.
 */
export function evaluateReconciliation(
  input: EvaluationInput
): EvaluationReport {
  const gtByPayment = new Map<string, GroundTruthCase>();
  for (const c of input.groundTruth) {
    if (!gtByPayment.has(c.paymentId)) gtByPayment.set(c.paymentId, c);
  }

  const emptyRow = (): ConfusionRow => ({
    expectedMatched: 0,
    expectedReview: 0,
    expectedProblem: 0,
  });
  const confusionMatrix: ConfusionMatrix = {
    MATCHED: emptyRow(),
    REVIEW: emptyRow(),
    MISMATCH: emptyRow(),
    MISSING: emptyRow(),
    REFUNDED: emptyRow(),
  };

  const scenarioAgg = new Map<
    GroundTruthScenario,
    { total: number; correct: number }
  >();
  const errors: EvaluationError[] = [];
  const unmatchedTransactionIds: string[] = [];
  const duplicateTransactionIds: string[] = [];
  const seen = new Set<string>();

  let correctDecisions = 0;
  let reviewDecisions = 0;

  for (const decision of input.decisions) {
    if (seen.has(decision.transactionId)) {
      duplicateTransactionIds.push(decision.transactionId);
      continue;
    }
    seen.add(decision.transactionId);

    const truth = gtByPayment.get(decision.transactionId);
    if (!truth) {
      unmatchedTransactionIds.push(decision.transactionId);
      continue;
    }

    const expected = expectedToCanonical(truth.expectedDecision);
    const actual = actualToCanonical(decision.decision);

    const row = confusionMatrix[decision.decision];
    if (expected === "MATCHED") row.expectedMatched += 1;
    else if (expected === "REVIEW") row.expectedReview += 1;
    else row.expectedProblem += 1;

    const isCorrect = expected === actual;
    if (isCorrect) correctDecisions += 1;
    else {
      errors.push({
        caseId: truth.caseId,
        transactionId: decision.transactionId,
        expectedDecision: truth.expectedDecision,
        actualDecision: decision.decision,
        scenario: truth.scenario,
        reason: `Ground truth expects ${truth.expectedDecision} (${expected}) for scenario ${truth.scenario}, but the engine returned ${decision.decision} (${actual}).`,
      });
    }
    if (actual === "REVIEW") reviewDecisions += 1;

    const agg = scenarioAgg.get(truth.scenario) ?? { total: 0, correct: 0 };
    agg.total += 1;
    if (isCorrect) agg.correct += 1;
    scenarioAgg.set(truth.scenario, agg);
  }

  const totalCases = correctDecisions + errors.length;

  // Precision / recall treat "escalate to review" as the positive class:
  //   TP = correctly escalated; FP = escalated when GT wanted auto-resolution;
  //   FN = GT wanted escalation but the engine resolved on its own.
  const truePositives = confusionMatrix.REVIEW.expectedReview;
  const falsePositives = (
    ["MATCHED", "MISMATCH", "MISSING", "REFUNDED"] as const
  ).reduce((sum, v) => sum + confusionMatrix[v].expectedReview, 0);
  const falseNegatives =
    confusionMatrix.REVIEW.expectedMatched +
    confusionMatrix.REVIEW.expectedProblem;

  const scenarioPerformance: ScenarioPerformance[] = GROUND_TRUTH_SCENARIOS.map(
    (scenario) => {
      const agg = scenarioAgg.get(scenario) ?? { total: 0, correct: 0 };
      return {
        scenario,
        total: agg.total,
        correct: agg.correct,
        incorrect: agg.total - agg.correct,
        accuracy: safeDiv(agg.correct, agg.total),
      };
    }
  );

  return {
    totals: {
      totalCases,
      correctDecisions,
      incorrectDecisions: errors.length,
      accuracy: safeDiv(correctDecisions, totalCases),
      precision: safeDiv(truePositives, truePositives + falsePositives),
      recall: safeDiv(truePositives, truePositives + falseNegatives),
      reviewRate: safeDiv(reviewDecisions, totalCases),
      autoResolutionRate: safeDiv(totalCases - reviewDecisions, totalCases),
      unmatchedTransactionCount: unmatchedTransactionIds.length,
      duplicateDecisionCount: duplicateTransactionIds.length,
    },
    confusionMatrix,
    errors,
    scenarioPerformance,
    unmatchedTransactionIds,
    duplicateTransactionIds,
  };
}
