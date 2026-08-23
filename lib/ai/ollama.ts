/**
 * ADAPT — local Ollama implementation of the AiJudgeProvider abstraction.
 *
 * Safety contract:
 *  - LOCAL AI ONLY: talks to OLLAMA_BASE_URL (default http://localhost:11434).
 *    Never OpenAI/Groq/Gemini/Claude or any paid/external API.
 *  - The model may only select a matchedRecordId from the candidate ids it
 *    was shown; anything else is treated as a hallucination.
 *  - EVERY failure (unavailable, timeout, malformed JSON, empty response,
 *    invalid decision, out-of-range confidence, hallucinated id, missing
 *    fields) degrades to the safe REVIEW fallback with confidence 0.
 */
import type { AiJudgeProvider, JudgeCandidateContext } from "./provider";
import { createSafeFallback } from "./provider";
import type {
  DecisionResult,
  ReconciliationDecision,
} from "../types";

const VALID_DECISIONS: readonly ReconciliationDecision[] = [
  "MATCHED",
  "REVIEW",
  "MISMATCH",
  "MISSING",
  "REFUNDED",
];

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5:7b-instruct";
const DEFAULT_TIMEOUT_MS = 60_000;

export interface OllamaRequestInit {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

export interface OllamaResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type OllamaFetch = (
  url: string,
  init: OllamaRequestInit
) => Promise<OllamaResponseLike>;

export interface OllamaJudgeOptions {
  /** env: OLLAMA_BASE_URL */
  baseUrl?: string;
  /** env: OLLAMA_MODEL */
  model?: string;
  /** env: OLLAMA_TIMEOUT_MS */
  timeoutMs?: number;
  /** Injectable HTTP layer so tests never need a running Ollama. */
  fetchImpl?: OllamaFetch;
}

interface RawVerdict {
  decision: ReconciliationDecision;
  confidence: number;
  matchedRecordId: string | null;
  reason: string;
  evidence: DecisionResult["evidence"];
}

class InvalidVerdictError extends Error {}

/** Mandatory safety language sent with every judging request. */
const SAFETY_RULES = [
  "You are an AI assistant for a financial reconciliation controller.",
  "You are not authorized to invent records or infer unsupported matches.",
  "Use only the supplied evidence.",
  "Similarity alone is insufficient for approval.",
  "If evidence is insufficient, choose REVIEW.",
  "Prefer REVIEW over an unsupported MATCHED decision.",
].join("\n");

function buildJudgePrompt(context: JudgeCandidateContext): string {
  const caseData = {
    paymentId: context.paymentId,
    orderId: context.orderId,
    payment: context.paymentSummary,
    candidateSettlements: context.candidateSettlements,
    refunds: context.refunds,
    ledgerEvidence: context.ledgerEvidence,
    deterministicEvidence: context.deterministicEvidence,
    candidateRecordIds: context.candidateRecordIds,
  };
  return [
    SAFETY_RULES,
    "",
    "Respond with ONLY one JSON object, no prose, using exactly this shape:",
    '{"decision":"MATCHED|REVIEW|MISMATCH|MISSING|REFUNDED","confidence":0.0,"matchedRecordId":null,"reason":"explanation","evidence":[{"field":"amount","value":"12000","significance":"why this matters"}]}',
    "Additional rules:",
    '- "matchedRecordId" must be null or one of candidateRecordIds; never invent an id.',
    '- "confidence" must be between 0 and 1.',
    "- If the supplied evidence does not clearly support a decision, choose REVIEW.",
    "",
    "CASE DATA:",
    JSON.stringify(caseData, null, 2),
  ].join("\n");
}

function parseAndValidateVerdict(
  rawText: string,
  candidateRecordIds: string[]
): RawVerdict {
  if (!rawText || rawText.trim() === "") {
    throw new InvalidVerdictError("empty response");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new InvalidVerdictError("malformed JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new InvalidVerdictError("response is not an object");
  }
  const v = parsed as Record<string, unknown>;

  const decision = v.decision;
  if (
    typeof decision !== "string" ||
    !VALID_DECISIONS.some((valid) => valid === decision)
  ) {
    throw new InvalidVerdictError(`invalid decision: ${String(decision)}`);
  }

  const confidence = v.confidence;
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new InvalidVerdictError("confidence out of range");
  }

  if (!("matchedRecordId" in v)) {
    throw new InvalidVerdictError("missing matchedRecordId");
  }
  const matchedRecordId = v.matchedRecordId;
  if (matchedRecordId !== null && typeof matchedRecordId !== "string") {
    throw new InvalidVerdictError("matchedRecordId must be null or a string");
  }
  if (
    typeof matchedRecordId === "string" &&
    !candidateRecordIds.includes(matchedRecordId)
  ) {
    throw new InvalidVerdictError(
      `hallucinated matchedRecordId: ${matchedRecordId}`
    );
  }

  const reason = v.reason;
  if (typeof reason !== "string" || reason.trim() === "") {
    throw new InvalidVerdictError("missing reason");
  }

  let evidence: RawVerdict["evidence"] = [];
  if (v.evidence !== undefined && v.evidence !== null) {
    if (!Array.isArray(v.evidence)) {
      throw new InvalidVerdictError("evidence must be an array");
    }
    evidence = v.evidence.map((item) => {
      const e = (item ?? {}) as Record<string, unknown>;
      const value = e.value;
      return {
        field: typeof e.field === "string" ? e.field : "unknown",
        expected: null,
        actual:
          typeof value === "string" || typeof value === "number"
            ? value
            : null,
        ...(typeof e.significance === "string"
          ? { detail: e.significance }
          : {}),
      };
    });
  }

  return {
    decision: decision as ReconciliationDecision,
    confidence,
    matchedRecordId,
    reason,
    evidence,
  };
}

/**
 * Create the local Ollama-backed judge. Reads OLLAMA_BASE_URL /
 * OLLAMA_MODEL / OLLAMA_TIMEOUT_MS from the environment unless overridden.
 * Never throws at judgement time: every failure becomes the safe fallback.
 */
export function createOllamaJudgeProvider(
  options: OllamaJudgeOptions = {}
): AiJudgeProvider {
  const baseUrl = (
    options.baseUrl ??
    process.env.OLLAMA_BASE_URL ??
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  const model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  const envTimeout = Number(process.env.OLLAMA_TIMEOUT_MS);
  const timeoutMs =
    options.timeoutMs ??
    (Number.isFinite(envTimeout) && envTimeout > 0
      ? envTimeout
      : DEFAULT_TIMEOUT_MS);
  const doFetch: OllamaFetch =
    options.fetchImpl ?? ((url, init) => fetch(url, init));

  async function generate(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: "json",
          options: { temperature: 0 },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`ollama http ${response.status}`);
      }
      const body = JSON.parse(await response.text()) as { response?: unknown };
      return typeof body.response === "string" ? body.response : "";
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: `ollama:${model}`,
    async judge(context: JudgeCandidateContext): Promise<DecisionResult> {
      try {
        const raw = await generate(buildJudgePrompt(context));
        const verdict = parseAndValidateVerdict(
          raw,
          context.candidateRecordIds
        );
        return {
          transactionId: context.paymentId,
          decision: verdict.decision,
          confidence: verdict.confidence,
          reason: verdict.reason,
          evidence: verdict.evidence,
          matchedRecordId: verdict.matchedRecordId,
          source: "OLLAMA",
        };
      } catch {
        // Fail safe: unavailable, timeout, malformed, or invalid output
        // must NEVER become an approval. Escalate to human review.
        return createSafeFallback(context.paymentId);
      }
    },
  };
}
