/**
 * ADAPT - Local Ollama AI Judge
 *
 * Safety:
 * - Local Ollama only.
 * - Ollama failures always become REVIEW with confidence 0.
 * - MATCHED can only use a candidateRecordId supplied by the application.
 * - Invalid JSON / invalid verdicts are rejected safely.
 */

import type {
  AiJudgeProvider,
  JudgeCandidateContext,
} from "./provider";

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

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen2.5:1.5b";
const DEFAULT_TIMEOUT_MS = 12_000;
const NUM_PREDICT = 512;
const SEED = 42;

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
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: OllamaFetch;
}

interface RawVerdict {
  decision: ReconciliationDecision;
  confidence: number;
  matchedRecordId: string | null;
  reason: string;
  evidence: DecisionResult["evidence"];
}

class InvalidVerdictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVerdictError";
  }
}

function normalizeBaseUrl(value?: string): string {
  let baseUrl = (value ?? DEFAULT_BASE_URL).trim();

  if (baseUrl.startsWith("OLLAMA_BASE_URL=")) {
    baseUrl = baseUrl
      .slice("OLLAMA_BASE_URL=".length)
      .trim();
  }

  if (
    (baseUrl.startsWith('"') && baseUrl.endsWith('"')) ||
    (baseUrl.startsWith("'") && baseUrl.endsWith("'"))
  ) {
    baseUrl = baseUrl.slice(1, -1).trim();
  }

  baseUrl = baseUrl.replace(/\/+$/, "");

  if (baseUrl.endsWith("/api")) {
    baseUrl = baseUrl.slice(0, -4);
  }

  if (!/^https?:\/\/[^/]+/i.test(baseUrl)) {
    throw new Error(
      `Invalid OLLAMA_BASE_URL: "${baseUrl}". ` +
        "Expected something like http://localhost:11434"
    );
  }

  return baseUrl;
}

function buildJudgePrompt(
  context: JudgeCandidateContext
): string {
  const caseData = {
    payment: {
      id: context.paymentSummary.id,
      orderId: context.paymentSummary.orderId,
      amount: context.paymentSummary.amount,
      status: context.paymentSummary.status,
    },

    settlements: context.candidateSettlements.map((s) => ({
      id: s.id,
      amount: s.amount,
      fee: s.fee,
      settlementDate: s.settlementDate,
    })),

    refunds: context.refunds.map((r) => ({
      id: r.id,
      amount: r.amount,
      timestamp: r.timestamp,
    })),

    ledger: context.ledgerEvidence.map((l) => ({
      id: l.id,
      referenceId: l.referenceId,
      debit: l.debit,
      credit: l.credit,
    })),

    deterministicEvidence:
      context.deterministicEvidence.map((e) => ({
        field: e.field,
        detail: e.detail,
      })),

    candidateRecordIds:
      context.candidateRecordIds,
  };

  return [
    "Financial reconciliation judge. Use ONLY supplied data. Never invent IDs or amounts.",
    "",
    "REVIEW escalation = engine could not auto-resolve. Evaluate independently; do NOT default to REVIEW.",
    "RULES: 1 candidate with matching paymentId+amount=MATCHED. 0 candidates=MISSING. Refund exists=REFUNDED. Ambiguous/contradictory=REVIEW. Amount differs=MISMATCH.",
    "",
    "Return ONLY JSON: {\"decision\":\"MATCHED|REVIEW|MISMATCH|MISSING|REFUNDED\",\"confidence\":0.0-1.0,\"matchedRecordId\":\"stl_xxx|null\",\"reason\":\"<10 words\",\"evidence\":[]}",
    "",
    "DATA:",
    JSON.stringify(caseData),
  ].join("\n");
}

function stripWrappingCodeFence(
  rawText: string
): string {
  const trimmed = rawText.trim();

  const match = trimmed.match(
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i
  );

  return match
    ? match[1].trim()
    : trimmed;
}

function parseAndValidateVerdict(
  rawText: string,
  candidateRecordIds: string[]
): RawVerdict {
  if (!rawText || rawText.trim() === "") {
    throw new InvalidVerdictError("empty response");
  }

  const cleanedText =
    stripWrappingCodeFence(rawText);

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    throw new InvalidVerdictError("malformed JSON");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new InvalidVerdictError(
      "response is not an object"
    );
  }

  const value =
    parsed as Record<string, unknown>;

  const decision = value.decision;

  if (
    typeof decision !== "string" ||
    !VALID_DECISIONS.includes(
      decision as ReconciliationDecision
    )
  ) {
    throw new InvalidVerdictError(
      `invalid decision: ${String(decision)}`
    );
  }

  const confidence = value.confidence;

  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new InvalidVerdictError(
      "confidence must be a finite number between 0 and 1"
    );
  }

  if (!("matchedRecordId" in value)) {
    throw new InvalidVerdictError(
      "missing matchedRecordId"
    );
  }

  const matchedRecordId =
    value.matchedRecordId;

  if (
    matchedRecordId !== null &&
    typeof matchedRecordId !== "string"
  ) {
    throw new InvalidVerdictError(
      "matchedRecordId must be null or a string"
    );
  }

  if (
    typeof matchedRecordId === "string" &&
    !candidateRecordIds.includes(
      matchedRecordId
    )
  ) {
    throw new InvalidVerdictError(
      `hallucinated matchedRecordId: ${matchedRecordId}`
    );
  }

  const reason = value.reason;

  if (
    typeof reason !== "string" ||
    reason.trim() === ""
  ) {
    throw new InvalidVerdictError(
      "missing reason"
    );
  }

  let evidence: DecisionResult["evidence"] = [];

  if (
    value.evidence !== undefined &&
    value.evidence !== null
  ) {
    if (!Array.isArray(value.evidence)) {
      throw new InvalidVerdictError(
        "evidence must be an array"
      );
    }

    if (value.evidence.length > 3) {
      throw new InvalidVerdictError(
        "evidence must contain at most 3 items"
      );
    }

    evidence = value.evidence.map((item) => {
      if (
        typeof item !== "object" ||
        item === null ||
        Array.isArray(item)
      ) {
        throw new InvalidVerdictError(
          "invalid evidence item"
        );
      }

      const e =
        item as Record<string, unknown>;

      const field =
        typeof e.field === "string"
          ? e.field
          : "unknown";

      const rawValue = e.value;

      const actual =
        typeof rawValue === "string" ||
        typeof rawValue === "number"
          ? rawValue
          : null;

      const detail =
        typeof e.significance === "string"
          ? e.significance
          : undefined;

      return {
        field,
        expected: null,
        actual,
        ...(detail ? { detail } : {}),
      };
    });
  }

  return {
    decision:
      decision as ReconciliationDecision,

    confidence,

    matchedRecordId,

    reason: reason.trim(),

    evidence,
  };
}

export function createOllamaJudgeProvider(
  options: OllamaJudgeOptions = {}
): AiJudgeProvider {
  const baseUrl = normalizeBaseUrl(
    options.baseUrl ??
      process.env.OLLAMA_BASE_URL
  );

  const model =
    options.model ??
    process.env.OLLAMA_MODEL ??
    DEFAULT_MODEL;

  const envTimeout =
    Number(
      process.env.OLLAMA_TIMEOUT_MS
    );

  const timeoutMs =
    options.timeoutMs ??
    (
      Number.isFinite(envTimeout) &&
      envTimeout > 0
        ? envTimeout
        : DEFAULT_TIMEOUT_MS
    );

  const doFetch: OllamaFetch =
    options.fetchImpl ??
    ((url, init) =>
      fetch(url, init));

  async function generate(
    prompt: string
  ): Promise<string> {
    const controller =
      new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    try {
      const response =
        await doFetch(
          `${baseUrl}/api/generate`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              model,

              prompt,

              stream: false,

              format: "json",

              keep_alive: "10m",

              options: {
                temperature: 0,
                num_predict: NUM_PREDICT,
                seed: SEED,
              },
            }),

            signal:
              controller.signal,
          }
        );

      if (!response.ok) {
        throw new Error(
          `Ollama HTTP ${response.status}`
        );
      }

      const responseText =
        await response.text();

      if (!responseText.trim()) {
        throw new Error(
          "Ollama returned an empty HTTP response"
        );
      }

      let body: unknown;

      try {
        body =
          JSON.parse(responseText);
      } catch {
        throw new Error(
          "Ollama returned malformed HTTP JSON"
        );
      }

      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      ) {
        throw new Error(
          "Ollama response is not an object"
        );
      }

      const responseBody =
        body as Record<string, unknown>;

      const generated =
        responseBody.response;

      if (
        typeof generated !== "string" ||
        generated.trim() === ""
      ) {
        throw new Error(
          "Ollama response field is missing or empty"
        );
      }

      return generated;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: `ollama:${model}`,

    async judge(
      context: JudgeCandidateContext
    ): Promise<DecisionResult> {
      const start = Date.now();
      console.error(`[OLLAMA] transaction=${context.paymentId} started model=${model}`);
      try {
        const prompt =
          buildJudgePrompt(context);

        const raw =
          await generate(prompt);

        const verdict =
          parseAndValidateVerdict(
            raw,
            context.candidateRecordIds
          );

        const elapsed = Date.now() - start;
        console.error(`[OLLAMA] transaction=${context.paymentId} completed in ${elapsed}ms decision=${verdict.decision} confidence=${verdict.confidence}`);

        return {
          transactionId:
            context.paymentId,

          decision:
            verdict.decision,

          confidence:
            verdict.confidence,

          reason:
            verdict.reason,

          evidence:
            verdict.evidence,

          matchedRecordId:
            verdict.matchedRecordId,

          source: "OLLAMA",
        };
      } catch (error) {
        const elapsed = Date.now() - start;
        const errorName =
          error instanceof Error
            ? error.name
            : typeof error;

        const errorMessage =
          error instanceof Error
            ? error.message
            : String(error);

        console.error(
          "[OLLAMA JUDGE ERROR]",
          JSON.stringify({
            transactionId:
              context.paymentId,

            model,

            url:
              `${baseUrl}/api/generate`,

            timeoutMs,

            elapsedMs: elapsed,

            errorName,

            errorMessage,
          })
        );

        return createSafeFallback(
          context.paymentId,
          "OLLAMA"
        );
      }
    },
  };
}

