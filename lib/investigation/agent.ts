/**
 * ADAPT — Investigation Agent
 * Bounded, deterministic investigation of reconciliation exceptions.
 * NEVER modifies financial records. NEVER fabricates evidence.
 */

import type { FinancialDataBundle, DecisionResult } from "../types";

export interface InvestigationStep {
  label: string;
  status: "complete" | "warning" | "info";
  detail: string;
}

export interface CandidateRecord {
  id: string;
  amount: number;
  fee: number;
  settlementDate: string;
  paymentId: string;
  amountMatch: boolean;
  referenceMatch: boolean;
}

export interface ControlPlan {
  finding: string;
  evidence: string;
  uncertainty: string;
  missingEvidence: string[];
  recommendedAction: string;
  actionType: "INVESTIGATE_MORE" | "VERIFY_REFERENCE" | "VERIFY_AMOUNT" | "VERIFY_DATE" | "REVIEW_CANDIDATES" | "HUMAN_APPROVAL";
  authority: string;
}

export interface InvestigationResult {
  transactionId: string;
  steps: InvestigationStep[];
  settlementCandidates: CandidateRecord[];
  evidence: {
    expectedAmount: number | null;
    candidateAmounts: number[];
    paymentReference: string | null;
    settlementReferences: string[];
    amountMatch: boolean | null;
    referenceMatch: boolean | null;
    settlementDateAvailable: boolean;
  };
  recommendation: "MATCH_CANDIDATE" | "REVIEW";
  confidence: number;
  reason: string;
  humanReviewRequired: boolean;
  controlPlan: ControlPlan;
  whyUnresolved: string | null;
  whatWouldResolve: string[];
  remainingRiskSignals: string[];
}

export function investigate(
  transactionId: string,
  data: FinancialDataBundle,
  decision: DecisionResult
): InvestigationResult {
  const steps: InvestigationStep[] = [];
  const payment = data.payments.find((p) => p.id === transactionId) ?? null;
  const order = payment ? data.orders.find((o) => o.id === payment.orderId) ?? null : null;

  // Step A — Exception received
  steps.push({ label: "Exception received", status: "complete", detail: `Transaction ${transactionId} classified as ${decision.decision}` });

  // Step B — Search settlement candidates
  const settlementCandidates = data.settlements.filter((s) => s.paymentId === transactionId);
  steps.push({ label: "Settlement candidates searched", status: "complete", detail: settlementCandidates.length > 0 ? `Found ${settlementCandidates.length} settlement candidate(s)` : "No settlement records found" });

  // Step C — Compare amounts
  const expectedAmount = payment?.amount ?? null;
  const candidateAmounts = settlementCandidates.map((c) => c.amount);
  const amountMatch = expectedAmount !== null && candidateAmounts.length > 0 ? candidateAmounts.some((a) => a === expectedAmount) : null;

  if (expectedAmount !== null && candidateAmounts.length > 0) {
    steps.push({ label: "Amounts compared", status: amountMatch ? "complete" : "warning", detail: amountMatch ? `Expected ₹${expectedAmount} matches settlement candidate` : `Expected ₹${expectedAmount}, candidates: ${candidateAmounts.map((a) => `₹${a}`).join(", ")}` });
  } else {
    steps.push({ label: "Amounts compared", status: "info", detail: expectedAmount === null ? "Payment amount not available" : "No settlement candidate amounts" });
  }

  // Step D — Compare references
  // FIX: payment.id (not orderId) must match settlement.paymentId — they are the same identifier type
  const paymentRef = payment?.id ?? null;
  const settlementRefs = settlementCandidates.map((c) => c.paymentId);
  const referenceMatch = paymentRef !== null && settlementRefs.length > 0 ? settlementRefs.some((r) => r === paymentRef) : null;
  steps.push({ label: "References compared", status: referenceMatch === true ? "complete" : referenceMatch === false ? "warning" : "info", detail: paymentRef ? `Payment ID: ${paymentRef} — ${referenceMatch ? "linked to settlement(s)" : "no direct settlement link found"}` : "Payment reference not available" });

  // Step E — Compare dates
  const settlementDateAvailable = settlementCandidates.some((c) => !!c.settlementDate);
  steps.push({ label: "Dates compared", status: settlementDateAvailable ? "complete" : "info", detail: settlementDateAvailable ? `Settlement dates: ${settlementCandidates.map((c) => c.settlementDate).filter(Boolean).join(", ")}` : "Settlement date unavailable" });

  // Step F — Evidence assessment
  const hasAmount = expectedAmount !== null;
  const hasCandidates = settlementCandidates.length > 0;
  const evidenceSufficient = hasAmount && hasCandidates && amountMatch === true && referenceMatch === true;
  steps.push({ label: "Evidence assessment", status: evidenceSufficient ? "complete" : "warning", detail: evidenceSufficient ? "SUFFICIENT" : `INSUFFICIENT — ${[!hasAmount && "no payment amount", !hasCandidates && "no settlement candidates", hasCandidates && amountMatch === false && "amount mismatch", hasCandidates && referenceMatch === false && "no direct settlement reference match"].filter(Boolean).join("; ")}` });

  // Step G — Recommendation
  let recommendation: "MATCH_CANDIDATE" | "REVIEW" = "REVIEW";
  let confidence = 0;
  let reason = "";
  let humanReviewRequired = true;

  if (evidenceSufficient && settlementCandidates.length === 1) {
    recommendation = "MATCH_CANDIDATE"; confidence = 0.85; reason = "Single settlement candidate with exact amount match and direct reference link"; humanReviewRequired = false;
  } else if (evidenceSufficient && settlementCandidates.length > 1) {
    confidence = 0.4; reason = "Multiple settlement candidates with amount match; exact match unclear";
  } else if (hasCandidates && amountMatch === false) {
    confidence = 0.2; reason = "Settlement candidate amounts do not match expected payment";
  } else if (!hasCandidates) {
    confidence = 0.1; reason = "No settlement candidates found";
  } else {
    confidence = 0.3; reason = "Evidence insufficient for automated match";
  }

  const controlPlan = generateControlPlan(recommendation, settlementCandidates, amountMatch, hasAmount, hasCandidates, settlementDateAvailable, referenceMatch);
  const whyUnresolved = recommendation === "REVIEW" ? generateWhyUnresolved(settlementCandidates, amountMatch, hasAmount, hasCandidates, referenceMatch) : null;
  const whatWouldResolve = generateWhatWouldResolve(recommendation, settlementCandidates, amountMatch, hasAmount, hasCandidates, settlementDateAvailable, paymentRef, referenceMatch);
  const remainingRiskSignals = extractRemainingRiskSignals(decision);

  const enrichedCandidates: CandidateRecord[] = settlementCandidates.map((c) => ({
    id: c.id, amount: c.amount, fee: c.fee, settlementDate: c.settlementDate, paymentId: c.paymentId,
    amountMatch: expectedAmount !== null ? c.amount === expectedAmount : false,
    referenceMatch: paymentRef !== null ? c.paymentId === paymentRef : false,
  }));

  return {
    transactionId, steps, settlementCandidates: enrichedCandidates,
    evidence: { expectedAmount, candidateAmounts, paymentReference: paymentRef, settlementReferences: settlementRefs, amountMatch, referenceMatch, settlementDateAvailable },
    recommendation, confidence, reason, humanReviewRequired,
    controlPlan, whyUnresolved, whatWouldResolve, remainingRiskSignals,
  };
}

function extractRemainingRiskSignals(decision: DecisionResult): string[] {
  const signals: string[] = [];
  const ev = decision.evidence;
  if (ev.some((e) => e.field === "duplicate.lookalike")) {
    const dup = ev.find((e) => e.field === "duplicate.lookalike");
    signals.push(`Transaction-level duplicate detected: ${dup?.actual ?? "unknown"}`);
  }
  if (ev.some((e) => e.field === "reference.nearDuplicate")) {
    const nd = ev.find((e) => e.field === "reference.nearDuplicate");
    signals.push(`Near-duplicate reference: ${nd?.actual ?? "unknown"}`);
  }
  if (ev.some((e) => e.field === "settlement.records" && typeof e.actual === "number" && (e.actual as number) > 1)) {
    signals.push("Multiple settlement records in deterministic evidence");
  }
  return signals;
}

function generateControlPlan(
  recommendation: "MATCH_CANDIDATE" | "REVIEW",
  candidates: { id: string; amount: number }[],
  amountMatch: boolean | null,
  hasAmount: boolean,
  hasCandidates: boolean,
  settlementDateAvailable: boolean,
  referenceMatch: boolean | null
): ControlPlan {
  if (recommendation === "MATCH_CANDIDATE" && candidates.length === 1) {
    return { finding: `Single settlement candidate ${candidates[0].id} matches the expected amount with direct reference link.`, evidence: `Expected amount matches candidate amount (${candidates[0].amount}) and paymentId links directly.`, uncertainty: "Candidate should still be verified against the available settlement reference.", missingEvidence: [], recommendedAction: "Verify settlement reference before approving the candidate.", actionType: "VERIFY_REFERENCE", authority: "Recommendation only — no financial record changed." };
  }
  if (hasCandidates && candidates.length > 1 && amountMatch) {
    return { finding: "Multiple settlement candidates remain plausible.", evidence: `${candidates.length} settlement candidates match the expected amount.`, uncertainty: "Available reference evidence cannot distinguish them.", missingEvidence: ["Verified settlement reference"], recommendedAction: "Review settlement candidates manually.", actionType: "REVIEW_CANDIDATES", authority: "Human approval required." };
  }
  if (hasCandidates && amountMatch === false) {
    return { finding: "Settlement candidates do not match the expected payment amount.", evidence: "Expected amount differs from settlement candidate amounts.", uncertainty: "The payment may have settled through a different record or the amount may have changed.", missingEvidence: ["Matching settlement record", "Payment gateway evidence"], recommendedAction: "Investigate settlement discrepancy.", actionType: "INVESTIGATE_MORE", authority: "Human approval required." };
  }
  if (!hasCandidates) {
    return { finding: "No reliable settlement match could be established.", evidence: "Settlement candidate unavailable.", uncertainty: "The payment may not have settled or the settlement record is missing.", missingEvidence: ["Verified settlement record"], recommendedAction: "Request settlement evidence.", actionType: "INVESTIGATE_MORE", authority: "Human review required." };
  }
  return { finding: "Evidence is insufficient to establish a reliable match.", evidence: hasAmount ? "Expected amount available but settlement match unclear." : "Payment amount not available.", uncertainty: "Critical evidence is missing or conflicting.", missingEvidence: [!hasAmount && "Payment amount", !hasCandidates && "Settlement candidate", !settlementDateAvailable && "Settlement date"].filter(Boolean) as string[], recommendedAction: "Gather additional evidence before proceeding.", actionType: "HUMAN_APPROVAL", authority: "Human review required." };
}

function generateWhyUnresolved(candidates: { id: string; amount: number }[], amountMatch: boolean | null, hasAmount: boolean, hasCandidates: boolean, referenceMatch: boolean | null): string {
  if (!hasCandidates) return "No settlement candidate was found for this transaction.";
  if (candidates.length > 1 && amountMatch) return `${candidates.length} settlement candidates remain plausible because both match the expected amount.`;
  if (amountMatch === false) return "Settlement candidate amounts do not match the expected payment amount.";
  if (referenceMatch === false) return "No settlement record directly references this payment ID.";
  if (!hasAmount) return "The payment amount required for comparison is unavailable.";
  return "Evidence is insufficient to resolve this case automatically.";
}

function generateWhatWouldResolve(recommendation: "MATCH_CANDIDATE" | "REVIEW", candidates: { id: string }[], amountMatch: boolean | null, hasAmount: boolean, hasCandidates: boolean, settlementDateAvailable: boolean, paymentRef: string | null, referenceMatch: boolean | null): string[] {
  const items: string[] = [];
  if (recommendation === "MATCH_CANDIDATE") { items.push("Verified settlement reference"); return items; }
  if (!hasCandidates) { items.push("Settlement record"); items.push("Payment gateway evidence"); }
  if (candidates.length > 1) { items.push("Verified settlement reference"); }
  if (amountMatch === false) { items.push("Matching settlement record"); }
  if (!settlementDateAvailable) { items.push("Confirmed settlement date"); }
  if (referenceMatch === false) { items.push("Settlement record linking to this payment ID"); }
  if (!paymentRef) { items.push("Payment gateway evidence"); }
  if (items.length === 0) { items.push("Human confirmation"); }
  return items;
}
