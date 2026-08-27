/**
 * ADAPT — Dual-Agent Orchestrator.
 * Runs Ollama (Resolution Analyst) and Groq (Challenge Analyst) independently.
 * They receive the same context. They NEVER see each other's output.
 * Deterministic Evidence Validator checks both responses.
 * Deterministic Adjudication Policy decides the final outcome.
 */
import type { AiJudgeProvider, JudgeCandidateContext } from "./provider";
import { createSafeFallback } from "./provider";
import type { DecisionResult, EvidenceItem, FinancialDataBundle } from "../types";
import { validateVerdict, type ValidationResult } from "./evidence-validator";

export type DualAgentStatus =
  | "SUCCESS"
  | "DISAGREEMENT"
  | "INVALID_EVIDENCE"
  | "FALLBACK"
  | "UNAVAILABLE";

export interface DualAgentResult {
  transactionId: string;
  agent1Verdict: DecisionResult;
  agent2Verdict: DecisionResult;
  agent1Validation: ValidationResult;
  agent2Validation: ValidationResult;
  agentAgreement: boolean;
  evidenceValid: boolean;
  aiStatus: DualAgentStatus;
  finalRecommendation: DecisionResult;
  decisionConfidence: number;
  failureReason: string | null;
}

export interface DualAgentOptions {
  agent1: AiJudgeProvider;
  agent2: AiJudgeProvider;
  timeoutMs?: number;
}

export function isSafeFallback(d: DecisionResult): boolean {
  return d.decision === "REVIEW" && d.confidence === 0 && d.reason.includes("unavailable or invalid");
}

/**
 * Canonical evidence normalization with source-grounded numeric resolution.
 * Both Ollama and Groq may return evidence in slightly different shapes
 * with hallucinated numeric values. This function:
 * 1. Normalizes field names (value→actual, significance→detail)
 * 2. Resolves numeric values from authoritative source records
 * Never trusts LLM-generated numeric values for financial fields.
 */
function normalizeEvidence(raw: unknown[], context: JudgeCandidateContext): EvidenceItem[] {
  if (!Array.isArray(raw)) return [];
  const payment = context.paymentSummary;
  const settlements = context.candidateSettlements;
  const refunds = context.refunds;

  const validItems: EvidenceItem[] = [];
  for (const item of raw) {
    // Reject non-objects, nulls, arrays, and items missing required 'field'
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      console.error(`[EVIDENCE NORMALIZE] Rejected non-object item: ${JSON.stringify(item)}`);
      continue;
    }
    const e = item as Record<string, unknown>;
    if (typeof e.field !== "string" || e.field.trim() === "") {
      console.error(`[EVIDENCE NORMALIZE] Rejected item missing 'field': ${JSON.stringify(e)}`);
      continue;
    }
    const field = e.field;

    // Canonical expected: use if present
    let expected: string | number | null = null;
    if (e.expected !== undefined && e.expected !== null) {
      expected = typeof e.expected === "string" || typeof e.expected === "number" ? e.expected : null;
    }

    // Canonical detail: prefer `detail`, fall back to `significance` (Ollama format)
    let detail: string | undefined;
    if (typeof e.detail === "string") detail = e.detail;
    else if (typeof e.significance === "string") detail = e.significance;

    // Resolve actual from sourceRecordId if present (Groq format)
    let actual: string | number | null = null;
    const sourceRecordId = typeof e.sourceRecordId === "string" ? e.sourceRecordId : null;
    if (sourceRecordId) {
      const stl = settlements.find((s) => String(s.id) === sourceRecordId);
      if (stl && (field === "settlement.total" || field === "amount" || field === "settlement.amount")) {
        actual = typeof stl.amount === "number" ? stl.amount : null;
        if (expected === null) expected = typeof payment.amount === "number" ? payment.amount : null;
      } else if (stl && field === "settlement.fee") {
        actual = typeof stl.fee === "number" ? stl.fee : null;
      } else if (String(payment.id) === sourceRecordId && (field === "payment.amount" || field === "amount")) {
        actual = typeof payment.amount === "number" ? payment.amount : null;
      } else {
        const ref = refunds.find((r) => String(r.id) === sourceRecordId);
        if (ref && field === "refund.amount") {
          actual = typeof ref.amount === "number" ? ref.amount : null;
        }
      }
    }

    // For settlement.total fields, ALWAYS resolve from authoritative source records
    // Never trust LLM-generated numeric values for financial fields
    if (field === "settlement.total" || field === "settlement.amount") {
      if (settlements.length > 0) {
        const totalAmount = settlements.reduce((sum, s) => sum + (typeof s.amount === "number" ? s.amount : 0), 0);
        actual = Math.round(totalAmount * 100) / 100;
        if (expected === null) expected = typeof payment.amount === "number" ? payment.amount : null;
      }
    }

    // For payment.amount fields, ALWAYS resolve from authoritative payment
    if (field === "payment.amount") {
      actual = typeof payment.amount === "number" ? payment.amount : null;
    }

    // Never trust LLM-generated numeric values for financial fields
    // If we couldn't resolve from source, use null
    validItems.push({ field, expected, actual, ...(detail ? { detail } : {}) });
  }
  return validItems;
}

/**
 * Normalize a verdict's evidence to canonical format before validation.
 * Returns a new DecisionResult with normalized evidence; does not mutate the original.
 */
function normalizeVerdict(verdict: DecisionResult, context: JudgeCandidateContext): DecisionResult {
  return {
    ...verdict,
    evidence: normalizeEvidence(verdict.evidence, context),
  };
}

function agentsAgree(a: DecisionResult, b: DecisionResult): boolean {
  if (a.decision !== b.decision) return false;
  // matchedRecordId must agree only for MATCHED decisions where it matters.
  // For REVIEW/MISMATCH/MISSING/REFUNDED, the matched record is not the
  // basis of the decision, so disagreement on matchedRecordId should not
  // block agreement on the decision itself.
  if (a.decision === "MATCHED" && a.matchedRecordId !== b.matchedRecordId) return false;
  return true;
}

function buildFallback(transactionId: string, reason: string): DecisionResult {
  return { ...createSafeFallback(transactionId), reason };
}

export async function runDualAgent(
  context: JudgeCandidateContext,
  data: FinancialDataBundle,
  options: DualAgentOptions
): Promise<DualAgentResult> {
  const { agent1, agent2 } = options;
  const tid = context.paymentId;
  const dualStart = Date.now();

  // Run both agents in parallel — they never see each other's output
  const [rawVerdict1, rawVerdict2] = await Promise.all([
    agent1.judge(context).catch((err) => {
      console.error(`[DUAL-AGENT] transaction=${tid} agent1(${agent1.name}) failed: ${err instanceof Error ? err.message : String(err)}`);
      return createSafeFallback(tid);
    }),
    agent2.judge(context).catch((err) => {
      console.error(`[DUAL-AGENT] transaction=${tid} agent2(${agent2.name}) failed: ${err instanceof Error ? err.message : String(err)}`);
      return createSafeFallback(tid);
    }),
  ]);

  const dualElapsed = Date.now() - dualStart;

  // Normalize evidence to canonical format and resolve from source records
  const verdict1 = normalizeVerdict(rawVerdict1, context);
  const verdict2 = normalizeVerdict(rawVerdict2, context);

  const v1 = validateVerdict(verdict1, context, data);
  const v2 = validateVerdict(verdict2, context, data);

  const agent1Failed = isSafeFallback(verdict1);
  const agent2Failed = isSafeFallback(verdict2);
  const agreement = agentsAgree(verdict1, verdict2);
  const bothValid = v1.valid && v2.valid;

  let aiStatus: DualAgentStatus;
  let finalRecommendation: DecisionResult;
  let decisionConfidence: number;
  let failureReason: string | null = null;

  // Adjudication Policy
  if (agent1Failed && agent2Failed) {
    aiStatus = "UNAVAILABLE";
    finalRecommendation = buildFallback(tid, "Both AI agents unavailable; human review required.");
    decisionConfidence = 0;
    failureReason = "Both agents returned safe fallback.";
  } else if (agent1Failed || agent2Failed) {
    aiStatus = "FALLBACK";
    finalRecommendation = buildFallback(tid, "One AI agent unavailable; human review required.");
    decisionConfidence = 0;
    failureReason = agent1Failed ? "Agent 1 (Ollama) unavailable." : "Agent 2 (Groq) unavailable.";
  } else if (!bothValid) {
    aiStatus = "INVALID_EVIDENCE";
    finalRecommendation = buildFallback(tid, "AI evidence validation failed; human review required.");
    decisionConfidence = 0;
    const invalidErrors = [...v1.errors, ...v2.errors].map((e) => `${e.field}: ${e.claim}`).join("; ");
    failureReason = `Evidence validation errors: ${invalidErrors}`;
  } else if (!agreement) {
    aiStatus = "DISAGREEMENT";
    finalRecommendation = buildFallback(tid, "AI agents disagree; human review required.");
    decisionConfidence = 0;
    failureReason = `Agent 1: ${verdict1.decision} vs Agent 2: ${verdict2.decision}`;
  } else {
    // Both agree and evidence is valid
    aiStatus = "SUCCESS";
    finalRecommendation = {
      ...verdict1,
      reason: `[Dual-Agent Agreement] ${verdict1.reason}`,
    };
    decisionConfidence = Math.min(verdict1.confidence, verdict2.confidence);
    failureReason = null;
  }

  console.error(`[DUAL-AGENT] transaction=${tid} status=${aiStatus} agent1=${verdict1.decision} agent2=${verdict2.decision} agreement=${agreement} evidenceValid=${bothValid} elapsed=${dualElapsed}ms`);

  return {
    transactionId: tid,
    agent1Verdict: verdict1,
    agent2Verdict: verdict2,
    agent1Validation: v1,
    agent2Validation: v2,
    agentAgreement: agreement,
    evidenceValid: bothValid,
    aiStatus,
    finalRecommendation,
    decisionConfidence,
    failureReason,
  };
}
