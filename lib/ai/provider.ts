/**
 * ADAPT — AI provider abstraction.
 * The reconciliation pipeline depends on this interface, never on Ollama
 * directly, so the local model stays swappable without touching logic.
 * Policy: LOCAL AI ONLY — implementations must never call paid/external APIs.
 */
import type { DecisionResult } from "../types";

/** Compact, serialisable fact handed to the model. */
export interface JudgeEvidenceItem {
  field: string;
  detail: string;
}

/**
 * Everything the model may see. Hard constraint: the model may ONLY pick a
 * matchedRecordId from candidateRecordIds — it can never invent records.
 */
export interface JudgeCandidateContext {
  paymentId: string;
  orderId: string | null;
  paymentSummary: Record<string, string | number>;
  candidateSettlements: Array<Record<string, string | number>>;
  refunds: Array<Record<string, string | number>>;
  ledgerEvidence: Array<Record<string, string | number>>;
  deterministicEvidence: JudgeEvidenceItem[];
  candidateRecordIds: string[];
}

/**
 * A local AI judge. Implementations MUST fail safe: any unavailable /
 * invalid outcome degrades to the safe REVIEW fallback, never an approval.
 */
export interface AiJudgeProvider {
  readonly name: string;
  /** Always resolves with a structured DecisionResult. */
  judge(context: JudgeCandidateContext): Promise<DecisionResult>;
}

/** Fixed reason used whenever the model is unavailable or its output is bad. */
export const SAFE_FALLBACK_REASON =
  "AI output unavailable or invalid; human review required";

/**
 * Mandatory safe fallback. Never silently approve a transaction because
 * the AI failed — always return REVIEW with confidence 0.
 */
export function createSafeFallback(transactionId: string): DecisionResult {
  return {
    transactionId,
    decision: "REVIEW",
    confidence: 0,
    reason: SAFE_FALLBACK_REASON,
    evidence: [],
    matchedRecordId: null,
    source: "OLLAMA",
  };
}
