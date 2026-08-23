/**
 * POST /api/reconcile
 *
 * Wires the existing pieces together:
 *   1. loads the synthetic dataset from data/*.json (read-only),
 *   2. runs the deterministic reconciliation engine,
 *   3. escalates ONLY "REVIEW" decisions to the local Ollama AI judge
 *      (the provider itself fails safe back to REVIEW on any problem),
 *   4. returns { decisions, summary } as JSON.
 *
 * No database writes. Deterministic except for the Ollama calls themselves.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  DecisionResult,
  FinancialDataBundle,
  ReconciliationDecision,
} from "../../../lib/types";
import { reconcile } from "../../../lib/reconciliation";
import { createOllamaJudgeProvider } from "../../../lib/ai/ollama";
import type {
  AiJudgeProvider,
  JudgeCandidateContext,
} from "../../../lib/ai/provider";

interface ReconciliationResponseSummary {
  total: number;
  matched: number;
  reviewed: number;
  mismatched: number;
  missing: number;
  refunded: number;
}

interface ReconciliationResponse {
  decisions: DecisionResult[];
  summary: ReconciliationResponseSummary;
}

export interface RunReconciliationOptions {
  /** Injectable for tests; defaults to the local Ollama provider. */
  provider?: AiJudgeProvider;
  /** Injectable for tests; defaults to <project root>/data. */
  dataDir?: string;
  /**
   * Performance switch (default false). When false, REVIEW decisions are
   * returned exactly as produced deterministically — the response never waits
   * for Ollama. Set true (or pass an explicit provider) to escalate REVIEW
   * cases to the AI judge within this request.
   */
  ai?: boolean;
}

async function loadJsonArray(
  fileName: string,
  dataDir: string
): Promise<unknown[]> {
  const raw = await readFile(path.join(dataDir, fileName), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${fileName}: expected a JSON array`);
  }
  return parsed;
}

async function loadBundle(dataDir: string): Promise<FinancialDataBundle> {
  const [orders, payments, settlements, refunds, ledger] = await Promise.all([
    loadJsonArray("orders.json", dataDir),
    loadJsonArray("payments.json", dataDir),
    loadJsonArray("settlements.json", dataDir),
    loadJsonArray("refunds.json", dataDir),
    loadJsonArray("ledger.json", dataDir),
  ]);
  return { orders, payments, settlements, refunds, ledger } as FinancialDataBundle;
}

const asText = (v: string | number | null): string =>
  v === null ? "null" : String(v);

/** Assemble the model's view of one ambiguous case from existing records. */
function buildJudgeContext(
  decision: DecisionResult,
  data: FinancialDataBundle
): JudgeCandidateContext | null {
  const payment = data.payments.find((p) => p.id === decision.transactionId);
  if (!payment) return null;

  const settlements = data.settlements.filter(
    (s) => s.paymentId === payment.id
  );
  const refunds = data.refunds.filter((r) => r.paymentId === payment.id);
  const refundIds = new Set(refunds.map((r) => r.id));
  const ledgerEvidence = data.ledger.filter(
    (l) => l.referenceId.includes(payment.id) || refundIds.has(l.referenceId)
  );

  return {
    paymentId: payment.id,
    orderId: payment.orderId,
    paymentSummary: {
      id: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      status: payment.status,
    },
    candidateSettlements: settlements.map((s) => ({
      id: s.id,
      paymentId: s.paymentId,
      amount: s.amount,
      fee: s.fee,
      settlementDate: s.settlementDate,
    })),
    refunds: refunds.map((r) => ({
      id: r.id,
      paymentId: r.paymentId,
      amount: r.amount,
      timestamp: r.timestamp,
    })),
    ledgerEvidence: ledgerEvidence.map((l) => ({
      id: l.id,
      referenceId: l.referenceId,
      debit: l.debit,
      credit: l.credit,
    })),
    deterministicEvidence: decision.evidence.map((e) => ({
      field: e.field,
      detail:
        e.detail ??
        `expected ${asText(e.expected)}, saw ${asText(e.actual)}`,
    })),
    // Hard constraint for the model: it may only pick from these ids.
    candidateRecordIds: [
      ...settlements.map((s) => s.id),
      ...refunds.map((r) => r.id),
    ],
  };
}

/** Escalate ONLY deterministic REVIEW cases; all other decisions pass through. */
async function escalateReviews(
  decisions: DecisionResult[],
  data: FinancialDataBundle,
  provider: AiJudgeProvider
): Promise<DecisionResult[]> {
  return Promise.all(
    decisions.map(async (decision) => {
      if (decision.decision !== "REVIEW") return decision;
      const context = buildJudgeContext(decision, data);
      if (!context) return decision; // cannot even build a case -> keep REVIEW
      // The provider fails safe: invalid/unavailable output returns REVIEW@0.
      return provider.judge(context);
    })
  );
}

/**
 * Full pipeline over the synthetic dataset. Exported so tests (and future
 * callers) can run it with an injected provider and never touch Ollama.
 */
export async function runReconciliation(
  options: RunReconciliationOptions = {}
): Promise<ReconciliationResponse> {
  const dataDir = options.dataDir ?? path.join(process.cwd(), "data");
  const data = await loadBundle(dataDir);

  const report = reconcile(data);

  // AI escalation is OPT-IN so the demo dashboard never blocks on Ollama.
  // An explicit injected provider (tests / deliberate investigation) or
  // ai:true enables it; otherwise REVIEW stays exactly as produced
  // deterministically, keeping its honest DETERMINISTIC source.
  const wantsAi = options.ai === true || options.provider !== undefined;
  const provider = wantsAi
    ? (options.provider ?? createOllamaJudgeProvider())
    : null;
  const decisions = provider
    ? await escalateReviews(report.decisions, data, provider)
    : report.decisions;

  const count = (d: ReconciliationDecision): number =>
    decisions.filter((x) => x.decision === d).length;

  return {
    decisions,
    summary: {
      total: decisions.length,
      matched: count("MATCHED"),
      reviewed: count("REVIEW"),
      mismatched: count("MISMATCH"),
      missing: count("MISSING"),
      refunded: count("REFUNDED"),
    },
  };
}

/**
 * Tiny TTL cache so the landing/dashboard/review pages (which fire around the
 * same time) reuse one deterministic computation instead of repeating all 100
 * cases. Deliberate AI runs always bypass it.
 */
const CACHE_TTL_MS = 15_000;
let cachedResponse: { at: number; body: ReconciliationResponse } | null = null;

/** Minimal POST surface: 400 on malformed body, opaque 500 on server errors.
 *  Body may contain { "ai": true } to run REVIEW escalation synchronously. */
export async function POST(request: Request): Promise<Response> {
  let wantAi = false;
  try {
    const text = await request.text();
    if (text.trim() !== "") {
      const parsed = JSON.parse(text) as { ai?: unknown };
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return Response.json(
          { error: "Malformed request body." },
          { status: 400 }
        );
      }
      wantAi = parsed.ai === true;
    }
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (
    !wantAi &&
    cachedResponse &&
    Date.now() - cachedResponse.at < CACHE_TTL_MS
  ) {
    return Response.json(cachedResponse.body);
  }

  try {
    const response = await runReconciliation({ ai: wantAi });
    if (!wantAi) {
      cachedResponse = { at: Date.now(), body: response };
    }
    return Response.json(response);
  } catch {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}