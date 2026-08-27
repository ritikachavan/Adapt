/**
 * POST /api/reconcile
 *
 * Pipeline:
 *
 * 1. Load synthetic financial data.
 * 2. Run deterministic reconciliation.
 * 3. Optionally send deterministic REVIEW cases to local Ollama.
 * 4. Never allow Ollama failure to produce MATCHED.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  DecisionResult,
  FinancialDataBundle,
  ReconciliationDecision,
} from "../../../lib/types";

import { reconcile } from "../../../lib/reconciliation";

import {
  createOllamaJudgeProvider,
} from "../../../lib/ai/ollama";

import {
  createSafeFallback,
  SAFE_FALLBACK_REASON,
  type AiJudgeProvider,
  type JudgeCandidateContext,
} from "../../../lib/ai/provider";

import {
  scoreDecision,
} from "../../../lib/risk/riskScoring";

import {
  analyzeDecision,
} from "../../../lib/risk/anomalyDetection";

import {
  recommendResolution,
} from "../../../lib/resolution/resolutionRecommendations";

import {
  runDualAgent,
  isSafeFallback,
  type DualAgentResult,
} from "../../../lib/ai/dual-agent";

import {
  createGrokJudgeProvider,
} from "../../../lib/ai/grok";

export interface ReconciliationResponseSummary {
  total: number;
  byDecision: Record<ReconciliationDecision, number>;
}

export interface AiMetrics {
  deterministicReviewCount: number;
  aiEscalatedCount: number;
  aiSuccessCount: number;
  aiFallbackCount: number;
  aiSkippedCount: number;
  aiEnabled: boolean;
  aiProvider: string | null;
  // Dual-agent metrics (null = not measured)
  dualAgentEnabled: boolean;
  grokProvider: string | null;
  ollamaInvocations: number | null;
  ollamaSuccesses: number | null;
  grokInvocations: number | null;
  grokSuccesses: number | null;
  grokFailures: number | null;
  dualAgentAgreements: number | null;
  dualAgentDisagreements: number | null;
  evidenceValidationPassed: number | null;
  evidenceValidationFailed: number | null;
  avgOllamaLatencyMs: number | null;
  avgGrokLatencyMs: number | null;
  totalAiLatencyMs: number | null;
}

export interface ReconciliationResponse {
  decisions: DecisionResult[];
  summary: ReconciliationResponseSummary;
  aiMetrics: AiMetrics;
}

export interface RunReconciliationOptions {
  provider?: AiJudgeProvider;
  dataDir?: string;
  ai?: boolean;
  maxEscalations?: number;
  dualAgent?: boolean;
}

async function loadJsonArray(
  fileName: string,
  dataDir: string
): Promise<unknown[]> {
  const raw =
    await readFile(
      path.join(dataDir, fileName),
      "utf8"
    );

  const parsed: unknown =
    JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(
      `${fileName}: expected JSON array`
    );
  }

  return parsed;
}

async function loadBundle(
  dataDir: string
): Promise<FinancialDataBundle> {
  const [
    orders,
    payments,
    settlements,
    refunds,
    ledger,
  ] = await Promise.all([
    loadJsonArray(
      "orders.json",
      dataDir
    ),

    loadJsonArray(
      "payments.json",
      dataDir
    ),

    loadJsonArray(
      "settlements.json",
      dataDir
    ),

    loadJsonArray(
      "refunds.json",
      dataDir
    ),

    loadJsonArray(
      "ledger.json",
      dataDir
    ),
  ]);

  return {
    orders,
    payments,
    settlements,
    refunds,
    ledger,
  } as FinancialDataBundle;
}

function asText(
  value: string | number | null
): string {
  return value === null
    ? "null"
    : String(value);
}

/**
 * Build the exact evidence context supplied to Ollama.
 */
function buildJudgeContext(
  decision: DecisionResult,
  data: FinancialDataBundle
): JudgeCandidateContext | null {
  const payment =
    data.payments.find(
      (p) =>
        p.id === decision.transactionId
    );

  if (!payment) {
    return null;
  }

  const settlements =
    data.settlements.filter(
      (s) =>
        s.paymentId === payment.id
    );

  const refunds =
    data.refunds.filter(
      (r) =>
        r.paymentId === payment.id
    );

  const refundIds =
    new Set(
      refunds.map(
        (r) => r.id
      )
    );

  const ledgerEvidence =
    data.ledger.filter(
      (l) =>
        l.referenceId.includes(
          payment.id
        ) ||
        refundIds.has(
          l.referenceId
        )
    );

  return {
    paymentId:
      payment.id,

    orderId:
      payment.orderId,

    paymentSummary: {
      id:
        payment.id,

      orderId:
        payment.orderId,

      amount:
        payment.amount,

      status:
        payment.status,
    },

    candidateSettlements:
      settlements.map((s) => ({
        id:
          s.id,

        paymentId:
          s.paymentId,

        amount:
          s.amount,

        fee:
          s.fee,

        settlementDate:
          s.settlementDate,
      })),

    refunds:
      refunds.map((r) => ({
        id:
          r.id,

        paymentId:
          r.paymentId,

        amount:
          r.amount,

        timestamp:
          r.timestamp,
      })),

    ledgerEvidence:
      ledgerEvidence.map((l) => ({
        id:
          l.id,

        referenceId:
          l.referenceId,

        debit:
          l.debit,

        credit:
          l.credit,
      })),

    deterministicEvidence:
      decision.evidence.map(
        (e) => ({
          field:
            e.field,

          detail:
            e.detail ??
            `expected ${asText(
              e.expected
            )}, saw ${asText(
              e.actual
            )}`,
        })
      ),

    /**
     * HARD SAFETY CONSTRAINT:
     * Ollama can only select one of these IDs.
     */
    candidateRecordIds: [
      ...settlements.map(
        (s) => s.id
      ),

      ...refunds.map(
        (r) => r.id
      ),
    ],
  };
}

/**
 * Maximum number of AI escalations to run in parallel.
 *
 * The AI stage wall-time is bounded by the number of sequential batches:
 * ceil(escalations / MAX_AI_PARALLEL) x providerTimeout. Running all selected
 * escalations concurrently collapses the AI stage to a single provider-timeout
 * window, which keeps even a slow local Ollama/Groq demo responsive. Each
 * escalation still runs both agents in parallel internally (runDualAgent).
 */
const MAX_AI_PARALLEL = 4;

/**
 * Default number of REVIEW cases sent to AI.
 */
const DEFAULT_MAX_ESCALATIONS = 4;

/**
 * Absolute maximum.
 *
 * Do not allow an accidental request to start
 * dozens of local generations.
 */
const MAX_ALLOWED_ESCALATIONS = 10;

function normalizeMaxEscalations(
  value: number | undefined
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return DEFAULT_MAX_ESCALATIONS;
  }

  return Math.min(
    Math.max(
      Math.floor(value),
      0
    ),
    MAX_ALLOWED_ESCALATIONS
  );
}

/**
 * Simple concurrency-limited worker pool.
 */
async function mapWithConcurrency<
  T,
  R
>(
  items: T[],
  limit: number,
  worker: (
    item: T,
    index: number
  ) => Promise<R>
): Promise<R[]> {
  const results =
    new Array<R>(
      items.length
    );

  let next = 0;

  async function runner(): Promise<void> {
    while (true) {
      const index = next;

      if (
        index >= items.length
      ) {
        return;
      }

      next += 1;

      results[index] =
        await worker(
          items[index],
          index
        );
    }
  }

  const workers =
    Array.from(
      {
        length:
          Math.min(
            limit,
            items.length
          ),
      },
      () => runner()
    );

  await Promise.all(
    workers
  );

  return results;
}

interface EscalationOutcome {
  decisions: DecisionResult[];
  deterministicReviewCount: number;
  aiEscalatedCount: number;
  aiSuccessCount: number;
  aiFallbackCount: number;
  aiSkippedCount: number;
  // Dual-agent instrumentation
  ollamaInvocations: number;
  ollamaSuccesses: number;
  grokInvocations: number;
  grokSuccesses: number;
  grokFailures: number;
  dualAgentAgreements: number;
  dualAgentDisagreements: number;
  evidenceValidationPassed: number;
  evidenceValidationFailed: number;
  ollamaLatencies: number[];
  grokLatencies: number[];
  totalAiLatencies: number[];
}

/**
 * Escalate only deterministic REVIEW decisions.
 * Supports both single-agent and dual-agent modes.
 */
async function escalateReviews(
  decisions: DecisionResult[],
  data: FinancialDataBundle,
  provider: AiJudgeProvider,
  maxEscalations: number,
  dualAgentProvider?: AiJudgeProvider
): Promise<EscalationOutcome> {
  const reviewIndices: number[] =
    [];

  decisions.forEach(
    (decision, index) => {
      if (
        decision.decision ===
        "REVIEW"
      ) {
        reviewIndices.push(
          index
        );
      }
    }
  );

  const deterministicReviewCount =
    reviewIndices.length;

  const selectedIndices =
    reviewIndices.slice(
      0,
      maxEscalations
    );

  const aiEscalatedCount =
    selectedIndices.length;

  const aiSkippedCount =
    deterministicReviewCount -
    aiEscalatedCount;

  let aiSuccessCount = 0;
  let aiFallbackCount = 0;
  let ollamaInvocations = 0;
  let ollamaSuccesses = 0;
  let grokInvocations = 0;
  let grokSuccesses = 0;
  let grokFailures = 0;
  let dualAgentAgreements = 0;
  let dualAgentDisagreements = 0;
  let evidenceValidationPassed = 0;
  let evidenceValidationFailed = 0;
  const ollamaLatencies: number[] = [];
  const grokLatencies: number[] = [];
  const totalAiLatencies: number[] = [];

  const aiStageStart = Date.now();
  const parallelism = Math.max(
    1,
    Math.min(
      MAX_AI_PARALLEL,
      selectedIndices.length
    )
  );
  console.error(
    `[AI] escalateReviews START: ${decisions.length} decisions, ${selectedIndices.length} selected, parallelism=${parallelism}`
  );

  /**
   * Only the selected REVIEW decisions are sent to AI. The remaining REVIEW
   * decisions are tagged AI_SKIPPED without touching the concurrency pool, so
   * the pool never serializes AI work behind trivial skipped returns and the
   * AI stage wall-time equals a single provider-timeout window.
   */
  const selectedDecisions =
    selectedIndices.map(
      (index) => decisions[index]
    );

  const judgedSelected =
    await mapWithConcurrency(
      selectedDecisions,
      parallelism,
      async (decision) => {
        const invStart = Date.now();

        const context =
          buildJudgeContext(
            decision,
            data
          );

        /**
         * No usable payment context:
         * keep original REVIEW.
         */
        if (!context) {
          aiFallbackCount += 1;
          return { ...decision, aiStatus: "AI_FALLBACK" as const };
        }

        console.error(`[AI] transaction=${decision.transactionId} dispatched dualAgent=${!!dualAgentProvider}`);
        let result: DecisionResult;

        if (dualAgentProvider) {
          // Dual-agent mode: run both agents in parallel
          try {
            const ollamaStart = performance.now();
            const groqStart = performance.now();
            const dualResult = await runDualAgent(context, data, {
              agent1: provider,
              agent2: dualAgentProvider,
            });
            const ollamaElapsed = performance.now() - ollamaStart;
            const groqElapsed = performance.now() - groqStart;

            // Collect per-agent metrics
            ollamaInvocations += 1;
            grokInvocations += 1;
            ollamaLatencies.push(ollamaElapsed);
            grokLatencies.push(groqElapsed);
            totalAiLatencies.push(Math.max(ollamaElapsed, groqElapsed));

            if (!isSafeFallback(dualResult.agent1Verdict)) ollamaSuccesses += 1;
            if (!isSafeFallback(dualResult.agent2Verdict)) grokSuccesses += 1;
            else grokFailures += 1;

            if (dualResult.evidenceValid) evidenceValidationPassed += 1;
            else evidenceValidationFailed += 1;

            if (dualResult.aiStatus === "SUCCESS") {
              dualAgentAgreements += 1;
              aiSuccessCount += 1;
            } else {
              if (dualResult.aiStatus === "DISAGREEMENT") dualAgentDisagreements += 1;
              aiFallbackCount += 1;
            }

            result = {
              ...dualResult.finalRecommendation,
              transactionId: decision.transactionId,
              dualAgent: {
                mode: "DUAL_AGENT",
                deterministicDecision: decision.decision,
                ollamaDecision: dualResult.agent1Verdict.decision,
                ollamaConfidence: dualResult.agent1Verdict.confidence,
                groqDecision: dualResult.agent2Verdict.decision,
                groqConfidence: dualResult.agent2Verdict.confidence,
                evidenceValidationPassed: dualResult.evidenceValid,
                evidenceValidationErrors: [
                  ...dualResult.agent1Validation.errors.map((e) => `${e.field}: ${e.claim}`),
                  ...dualResult.agent2Validation.errors.map((e) => `${e.field}: ${e.claim}`),
                ],
                adjudication: dualResult.aiStatus === "SUCCESS" ? "AGREED"
                  : dualResult.aiStatus === "DISAGREEMENT" ? "DISAGREED"
                  : dualResult.aiStatus === "INVALID_EVIDENCE" ? "EVIDENCE_FAILED"
                  : dualResult.aiStatus === "UNAVAILABLE" ? "PROVIDER_UNAVAILABLE"
                  : "FALLBACK",
              },
            };
          } catch {
            aiFallbackCount += 1;
            grokFailures += 1;
            result = {
              ...createSafeFallback(decision.transactionId),
              reason: "Dual-agent execution failed; human review required.",
            };
          }
        } else {
          // Single-agent mode (existing behavior)
          try {
            result = await provider.judge(context);
          } catch {
            aiFallbackCount += 1;
            return {
              ...createSafeFallback(decision.transactionId),
              aiStatus: "AI_FALLBACK" as const,
            };
          }
          if (result.reason === SAFE_FALLBACK_REASON) {
            aiFallbackCount += 1;
            return { ...result, aiStatus: "AI_FALLBACK" as const };
          } else {
            aiSuccessCount += 1;
            return { ...result, aiStatus: "AI_SUCCESS" as const };
          }
        }

        const aiStatus = result.reason === SAFE_FALLBACK_REASON || result.reason.includes("human review required")
          ? "AI_FALLBACK" as const
          : "AI_SUCCESS" as const;

        return { ...result, aiStatus };
      }
    );

  const judgedByIndex =
    new Map<number, DecisionResult>();
  selectedIndices.forEach(
    (origIndex, pos) => {
      judgedByIndex.set(
        origIndex,
        judgedSelected[pos]
      );
    }
  );

  const judged =
    decisions.map((decision, index) =>
      judgedByIndex.has(index)
        ? judgedByIndex.get(index)!
        : { ...decision, aiStatus: "AI_SKIPPED" as const }
    );

  const aiStageElapsed = Date.now() - aiStageStart;
  console.error(`[AI] escalateReviews END: ${aiStageElapsed}ms total, ${aiEscalatedCount} investigations, ${aiSuccessCount} successes, ${aiFallbackCount} fallbacks`);

  return {
    decisions: judged,
    deterministicReviewCount,
    aiEscalatedCount,
    aiSuccessCount,
    aiFallbackCount,
    aiSkippedCount,
    ollamaInvocations,
    ollamaSuccesses,
    grokInvocations,
    grokSuccesses,
    grokFailures,
    dualAgentAgreements,
    dualAgentDisagreements,
    evidenceValidationPassed,
    evidenceValidationFailed,
    ollamaLatencies,
    grokLatencies,
    totalAiLatencies,
  };
}

export async function runReconciliation(
  options: RunReconciliationOptions = {}
): Promise<ReconciliationResponse> {
  const dataDir =
    options.dataDir ??
    path.join(
      process.cwd(),
      "data"
    );

  const data =
    await loadBundle(
      dataDir
    );

  /**
   * ALWAYS run deterministic reconciliation first.
   */
  const report =
    reconcile(data);

  const deterministicReviewCount =
    report.decisions.filter(
      (d) =>
        d.decision ===
        "REVIEW"
    ).length;

  /**
   * AI is explicitly opt-in for escalation,
   * but we always check availability for the status indicator.
   */
  const wantsAi =
    options.ai === true ||
    options.provider !== undefined;

  const provider =
    wantsAi
      ? (
          options.provider ??
          createOllamaJudgeProvider()
        )
      : null;

  // Create Groq provider for dual-agent mode
  let dualAgentProvider: AiJudgeProvider | undefined;
  if (wantsAi && options.dualAgent) {
    const groqApiKey = process.env.GROQ_API_KEY ?? "";
    if (groqApiKey) {
      dualAgentProvider = createGrokJudgeProvider({
        apiKey: groqApiKey,
        model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        baseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
        timeoutMs: Number(process.env.GROQ_TIMEOUT_MS) || 12_000,
      });
    }
  }

  /**
   * Determine if the AI provider is available
   * regardless of whether this run uses it.
   * This powers the dashboard status indicator.
   */
  let aiAvailable = false;
  let aiProviderName: string | null = null;
  try {
    const probe =
      options.provider ??
      createOllamaJudgeProvider();
    aiAvailable = true;
    aiProviderName = probe.name;
  } catch {
    aiAvailable = false;
  }

  const maxEscalations =
    normalizeMaxEscalations(
      options.maxEscalations
    );

  let decisions = report.decisions;
  let aiEscalatedCount = 0;
  let aiSuccessCount = 0;
  let aiFallbackCount = 0;
  let aiSkippedCount = deterministicReviewCount;
  let outcome: EscalationOutcome | null = null;

  if (provider) {
    outcome = await escalateReviews(
      report.decisions,
      data,
      provider,
      maxEscalations,
      dualAgentProvider
    );

    decisions = outcome.decisions;
    aiEscalatedCount = outcome.aiEscalatedCount;
    aiSuccessCount = outcome.aiSuccessCount;
    aiFallbackCount = outcome.aiFallbackCount;
    aiSkippedCount = outcome.aiSkippedCount;
  } else {
    // AI not requested: tag all REVIEW decisions
    decisions = decisions.map((d) =>
      d.decision === "REVIEW"
        ? { ...d, aiStatus: "AI_NOT_REQUESTED" as const }
        : d
    );
  }

  function count(
    decision: ReconciliationDecision
  ): number {
    return decisions.filter(
      (d) =>
        d.decision ===
        decision
    ).length;
  }

  // Apply ML-assisted risk scoring to all decisions
  for (const d of decisions) {
    const assessment = scoreDecision(d);
    if (assessment) {
      d.risk = {
        score: assessment.score,
        level: assessment.level,
        signals: assessment.signals,
      };
    }
  }

  // Apply anomaly detection to all decisions
  for (const d of decisions) {
    const anomaly = analyzeDecision(d);
    if (anomaly) {
      d.anomaly = anomaly;
    }
  }

  // Apply resolution recommendations to all decisions
  for (const d of decisions) {
    const resolution = recommendResolution(d);
    if (resolution) {
      d.resolution = resolution;
    }
  }

  return {
    decisions,

    summary: {
      total:
        decisions.length,

      byDecision: {
        MATCHED: count("MATCHED"),
        REVIEW: count("REVIEW"),
        MISMATCH: count("MISMATCH"),
        MISSING: count("MISSING"),
        REFUNDED: count("REFUNDED"),
      },
    },

    aiMetrics: {
      deterministicReviewCount,
      aiEscalatedCount,
      aiSuccessCount,
      aiFallbackCount,
      aiSkippedCount,
      aiEnabled: aiAvailable,
      aiProvider: aiProviderName ?? null,
      dualAgentEnabled: !!dualAgentProvider,
      grokProvider: dualAgentProvider?.name ?? null,
      ollamaInvocations: outcome?.ollamaInvocations ?? null,
      ollamaSuccesses: outcome?.ollamaSuccesses ?? null,
      grokInvocations: outcome?.grokInvocations ?? null,
      grokSuccesses: outcome?.grokSuccesses ?? null,
      grokFailures: outcome?.grokFailures ?? null,
      dualAgentAgreements: outcome?.dualAgentAgreements ?? null,
      dualAgentDisagreements: outcome?.dualAgentDisagreements ?? null,
      evidenceValidationPassed: outcome?.evidenceValidationPassed ?? null,
      evidenceValidationFailed: outcome?.evidenceValidationFailed ?? null,
      avgOllamaLatencyMs: outcome?.ollamaLatencies.length
        ? Math.round(outcome.ollamaLatencies.reduce((a, b) => a + b, 0) / outcome.ollamaLatencies.length)
        : null,
      avgGrokLatencyMs: outcome?.grokLatencies.length
        ? Math.round(outcome.grokLatencies.reduce((a, b) => a + b, 0) / outcome.grokLatencies.length)
        : null,
      totalAiLatencyMs: outcome?.totalAiLatencies.length
        ? Math.round(outcome.totalAiLatencies.reduce((a, b) => a + b, 0) / outcome.totalAiLatencies.length)
        : null,
    },
  };
}

/**
 * Deterministic response cache.
 *
 * AI requests never use this cache.
 */
const CACHE_TTL_MS =
  15_000;

let cachedResponse:
  {
    at: number;
    body: ReconciliationResponse;
  } | null = null;

/**
 * Latest reconciliation result (including AI).
 * Persists across page navigations.
 * Dashboard and Review pages can retrieve this via GET.
 */
let latestResult: ReconciliationResponse | null = null;

/**
 * Exposes the most recent reconciliation result (including AI) to other API routes
 * so that /api/review and /api/audit always reflect the same authoritative state
 * as the dashboard, rather than re-running deterministic-only reconciliation.
 */
export function getLatestResult(): ReconciliationResponse | null {
  return latestResult;
}

export function setLatestResult(result: ReconciliationResponse | null): void {
  latestResult = result;
}

export async function POST(
  request: Request
): Promise<Response> {
  let wantAi = false;
  let wantDualAgent = false;

  let maxEscalations:
    number | undefined;

  try {
    const text =
      await request.text();

    if (
      text.trim() !== ""
    ) {
      const parsed =
        JSON.parse(text) as {
          ai?: unknown;
          maxEscalations?: unknown;
          dualAgent?: unknown;
        };

      if (
        typeof parsed !==
          "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return Response.json(
          {
            error:
              "Malformed request body.",
          },
          {
            status: 400,
          }
        );
      }

      wantAi =
        parsed.ai === true;

      wantDualAgent =
        parsed.dualAgent === true;

      if (
        typeof parsed.maxEscalations ===
          "number" &&
        Number.isFinite(
          parsed.maxEscalations
        )
      ) {
        maxEscalations =
          parsed.maxEscalations;
      }
    }
  } catch {
    return Response.json(
      {
        error:
          "Malformed request body.",
      },
      {
        status: 400,
      }
    );
  }

  /**
   * Deterministic requests can use cache.
   * AI requests NEVER use cache.
   */
  if (
    !wantAi &&
    cachedResponse &&
    Date.now() -
      cachedResponse.at <
      CACHE_TTL_MS
  ) {
    return Response.json(
      cachedResponse.body
    );
  }

  try {
    const response =
      await runReconciliation({
        ai:
          wantAi,

        maxEscalations,
        dualAgent: wantDualAgent,
      });

    if (!wantAi) {
      cachedResponse = {
        at:
          Date.now(),

        body:
          JSON.parse(
            JSON.stringify(
              response
            )
          ),
      };
    }

    // Always store the latest result (including AI results)
    latestResult = JSON.parse(
      JSON.stringify(response)
    );

    return Response.json(
      response
    );
  } catch (error) {
    console.error(
      "[RECONCILE ERROR]",
      error
    );

    return Response.json(
      {
        error:
          "Internal server error.",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * GET /api/reconcile — returns the latest reconciliation result.
 * Used by Dashboard to restore state after navigation.
 */
export async function GET(): Promise<Response> {
  if (latestResult) {
    return Response.json(latestResult);
  }
  return Response.json({ error: "No reconciliation result available. Run reconciliation first." }, { status: 404 });
}

