/**
 * ADAPT — Deterministic Evidence Validator.
 * Validates every factual claim in an AI response against actual source records.
 * Pure functions only. No AI, no I/O, no randomness.
 */
import type { DecisionResult, FinancialDataBundle } from "../types";
import type { JudgeCandidateContext } from "./provider";

export interface ValidationError {
  field: string;
  claim: string;
  actual: string;
  severity: "CRITICAL" | "WARNING";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export function validateVerdict(
  verdict: DecisionResult,
  context: JudgeCandidateContext,
  data: FinancialDataBundle
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 1. Validate transaction ID exists
  const payment = data.payments.find((p) => p.id === verdict.transactionId);
  if (!payment) {
    errors.push({ field: "transactionId", claim: verdict.transactionId, actual: "not found", severity: "CRITICAL" });
  }

  // 2. Validate matchedRecordId is in candidate list
  if (verdict.matchedRecordId !== null) {
    if (!context.candidateRecordIds.includes(verdict.matchedRecordId)) {
      errors.push({ field: "matchedRecordId", claim: verdict.matchedRecordId, actual: `not in candidates: [${context.candidateRecordIds.join(", ")}]`, severity: "CRITICAL" });
    } else {
      // 3. Validate settlement exists and belongs to this payment
      const settlement = data.settlements.find((s) => s.id === verdict.matchedRecordId);
      if (!settlement) {
        errors.push({ field: "matchedRecordId", claim: verdict.matchedRecordId, actual: "settlement not found in records", severity: "CRITICAL" });
      } else if (settlement.paymentId !== verdict.transactionId) {
        errors.push({ field: "matchedRecordId", claim: `settlement ${verdict.matchedRecordId} belongs to ${settlement.paymentId}`, actual: `expected paymentId ${verdict.transactionId}`, severity: "CRITICAL" });
      }
    }
  }

  // 4. Validate evidence items against actual records
  for (const ev of verdict.evidence) {
    if (ev.field === "settlement.total" && typeof ev.actual === "number" && payment) {
      const settlements = data.settlements.filter((s) => s.paymentId === payment.id);
      const actualTotal = settlements.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(ev.actual - actualTotal) > 0.01) {
        errors.push({ field: "evidence.settlement.total", claim: `actual=${ev.actual}`, actual: `records show ${actualTotal}`, severity: "CRITICAL" });
      }
    }

    if (ev.field === "payment.amount" && typeof ev.expected === "number" && payment) {
      if (Math.abs(ev.expected - payment.amount) > 0.01) {
        errors.push({ field: "evidence.payment.amount", claim: `expected=${ev.expected}`, actual: `payment shows ${payment.amount}`, severity: "CRITICAL" });
      }
    }

    // Validate settlement IDs mentioned in evidence
    if (ev.field.startsWith("settlement.") && typeof ev.actual === "string" && ev.actual.startsWith("stl_")) {
      const stl = data.settlements.find((s) => s.id === ev.actual);
      if (!stl) {
        warnings.push({ field: "evidence.settlement.id", claim: ev.actual, actual: "settlement ID not found in records", severity: "WARNING" });
      }
    }
  }

  // 5. Validate decision is in allowed set
  const validDecisions = ["MATCHED", "REVIEW", "MISMATCH", "MISSING", "REFUNDED"];
  if (!validDecisions.includes(verdict.decision)) {
    errors.push({ field: "decision", claim: verdict.decision, actual: `not in [${validDecisions.join(", ")}]`, severity: "CRITICAL" });
  }

  // 6. Validate confidence is in range
  if (typeof verdict.confidence !== "number" || !Number.isFinite(verdict.confidence) || verdict.confidence < 0 || verdict.confidence > 1) {
    errors.push({ field: "confidence", claim: String(verdict.confidence), actual: "must be 0-1", severity: "CRITICAL" });
  }

  return { valid: errors.length === 0, errors, warnings };
}
