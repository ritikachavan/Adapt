/**
 * GET /api/audit?transactionId=pay_x
 *
 * DECISION REPLAY — assembles everything ADAPT knows about ONE transaction so
 * a reviewer can see exactly how its verdict was reached:
 *   1. financial records        (order / payment / settlements / refunds / ledger)
 *   2. deterministic decision   (from the reconciliation engine)
 *   3. AI judge stage           (from the latest reconciliation result, if AI was run;
 *                                otherwise an honest NOT_INVOKED status)
 *   4. human review             (stored Corrections for this transaction)
 *   5. correction memory        (rule-based recall from correction-memory.ts)
 *
 * Presentation only. Nothing here fabricates history: every stage reflects
 * records that actually exist.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { reconcile } from "../../../lib/reconciliation";
import {
  findRelevantCorrections,
  getDb,
} from "../../../lib/correction-memory";
import { SAFE_FALLBACK_REASON } from "../../../lib/ai/provider";
import { getLatestResult } from "../reconcile/route";
import type { DecisionResult, FinancialDataBundle } from "../../../lib/types";

/** Local copy of the dataset loader (kept tiny to avoid cross-route coupling). */
async function loadBundle(): Promise<FinancialDataBundle> {
  const load = async (name: string): Promise<unknown[]> => {
    const raw = await readFile(path.join(process.cwd(), "data", name), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`${name}: expected an array`);
    return parsed;
  };
  const [orders, payments, settlements, refunds, ledger] = await Promise.all([
    load("orders.json"),
    load("payments.json"),
    load("settlements.json"),
    load("refunds.json"),
    load("ledger.json"),
  ]);
  return { orders, payments, settlements, refunds, ledger } as FinancialDataBundle;
}

interface AiStage {
  invoked: boolean;
  status: "NOT_INVOKED" | "NOT_ESCALATED" | "EVALUATED" | "UNAVAILABLE_FALLBACK";
  message: string;
  decision?: string;
  confidence?: number;
  reason?: string;
  evidence?: unknown[];
  source?: string;
  dualAgent?: {
    mode: string;
    ollamaDecision: string | null;
    ollamaConfidence: number | null;
    groqDecision: string | null;
    groqConfidence: number | null;
    evidenceValidationPassed: boolean | null;
    evidenceValidationErrors: string[];
    adjudication: string | null;
  } | null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const transactionId =
      new URL(request.url).searchParams.get("transactionId")?.trim() ?? "";
    if (!transactionId) {
      return Response.json(
        { error: "transactionId query parameter is required." },
        { status: 400 }
      );
    }

    const data = await loadBundle();

    const payment = data.payments.find((p) => p.id === transactionId);
    const deterministicDecision = report_findDecision(data, transactionId);
    if (!payment && !deterministicDecision) {
      return Response.json(
        { error: `Transaction ${transactionId} not found.` },
        { status: 404 }
      );
    }

    const order = payment
      ? (data.orders.find((o) => o.id === payment.orderId) ?? null)
      : null;
    const settlements = data.settlements.filter(
      (s) => s.paymentId === transactionId
    );
    const refunds = data.refunds.filter(
      (r) => r.paymentId === transactionId
    );
    const refundIds = new Set(refunds.map((r) => r.id));
    const ledger = data.ledger.filter(
      (l) =>
        l.referenceId.includes(transactionId) ||
        refundIds.has(l.referenceId)
    );

    const records = { order, payment: payment ?? null, settlements, refunds, ledger };
    const deterministic = deterministicDecision
      ? {
          present: true,
          decision: deterministicDecision.decision,
          confidence: deterministicDecision.confidence,
          reason: deterministicDecision.reason,
          evidence: deterministicDecision.evidence,
          matchedRecordId: deterministicDecision.matchedRecordId,
          source: deterministicDecision.source,
        }
      : { present: false };

    // AI stage: prefer the latest reconciliation result (includes AI if it was run).
    // Fall back to stored decision rows (materialised during correction) when
    // no live result is available, e.g. in isolated test runs.
    const latest = getLatestResult();
    const latestDecision: DecisionResult | undefined = latest
      ? latest.decisions.find((d) => d.transactionId === transactionId)
      : undefined;

    const db = getDb();
    const storedDecisions = await db.reconciliationDecision.findMany({
      where: { transactionId },
      orderBy: { createdAt: "desc" },
    });
    const storedAiRow =
      storedDecisions.find((r) => r.source === "OLLAMA" || r.source === "GROQ" || r.source === "FALLBACK") ?? null;

    let ai: AiStage;

    if (latestDecision && latestDecision.aiStatus === "AI_SUCCESS") {
      ai = {
        invoked: true,
        status: "EVALUATED",
        message: latestDecision.dualAgent?.mode === "DUAL_AGENT"
          ? "Evaluated by dual-agent AI verification (Resolution Analyst + Challenge Analyst)."
          : "Evaluated by the local Ollama judge.",
        decision: latestDecision.decision,
        confidence: latestDecision.confidence,
        reason: latestDecision.reason,
        evidence: latestDecision.evidence,
        source: latestDecision.source,
        dualAgent: latestDecision.dualAgent ?? null,
      };
    } else if (latestDecision && latestDecision.aiStatus === "AI_FALLBACK") {
      ai = {
        invoked: true,
        status: "UNAVAILABLE_FALLBACK",
        message: "AI was invoked but could not produce a valid verdict. Human review required.",
        decision: latestDecision.decision,
        confidence: latestDecision.confidence,
        reason: latestDecision.reason,
        evidence: latestDecision.evidence,
        source: latestDecision.source,
        dualAgent: latestDecision.dualAgent ?? null,
      };
    } else if (latestDecision && latestDecision.aiStatus === "AI_SKIPPED") {
      ai = {
        invoked: true,
        status: "NOT_ESCALATED",
        message: "AI was enabled for this run but this case was not escalated (escalation cap reached).",
        decision: latestDecision.decision,
        confidence: latestDecision.confidence,
        reason: latestDecision.reason,
        evidence: latestDecision.evidence,
        source: latestDecision.source,
      };
    } else if (latestDecision && latestDecision.aiStatus === "AI_NOT_REQUESTED") {
      ai = {
        invoked: false,
        status: "NOT_INVOKED",
        message: "AI was not requested for this reconciliation run.",
      };
    } else if (storedAiRow) {
      // Fall back to stored decision rows (correction materialised)
      if (storedAiRow.reason === SAFE_FALLBACK_REASON) {
        ai = {
          invoked: false,
          status: "UNAVAILABLE_FALLBACK",
          message: "AI unavailable — human review required.",
          decision: storedAiRow.decision,
          confidence: storedAiRow.confidence,
          reason: storedAiRow.reason,
          source: storedAiRow.source,
        };
      } else {
        let parsedEvidence: unknown[] = [];
        try {
          parsedEvidence = JSON.parse(storedAiRow.evidence ?? "[]") as unknown[];
        } catch {
          parsedEvidence = [];
        }
        ai = {
          invoked: true,
          status: "EVALUATED",
          message: "Evaluated by the local Ollama judge.",
          decision: storedAiRow.decision,
          confidence: storedAiRow.confidence,
          reason: storedAiRow.reason,
          evidence: parsedEvidence,
          source: storedAiRow.source,
        };
      }
    } else {
      ai = {
        invoked: false,
        status: "NOT_INVOKED",
        message:
          "AI not invoked — deterministic controller resolved or escalated this case.",
      };
    }

    const corrections = await db.correction.findMany({
      where: { decision: { transactionId } },
      orderBy: { createdAt: "desc" },
    });
    const memoryMatches = await findRelevantCorrections(
      { transactionId },
      50
    );

    return Response.json({
      transactionId,
      found: true,
      records,
      deterministic,
      ai,
      humanReview: {
        present: corrections.length > 0,
        corrections: corrections.map((c) => ({
          id: c.id,
          originalDecision: c.originalDecision,
          correctedDecision: c.correctedDecision,
          correctionType: c.correctionType,
          explanation: c.explanation,
          createdAt: c.createdAt,
        })),
      },
      memory: {
        present: memoryMatches.length > 0,
        items: memoryMatches.map((m) => ({
          correctionType: m.correction.correctionType,
          originalDecision: m.correction.originalDecision,
          correctedDecision: m.correction.correctedDecision,
          explanation: m.correction.explanation,
          score: m.score,
          transactionId: m.transactionId,
        })),
      },
    });
  } catch {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}

function report_findDecision(data: FinancialDataBundle, transactionId: string) {
  return (
    reconcile(data).decisions.find((d) => d.transactionId === transactionId) ??
    null
  );
}
