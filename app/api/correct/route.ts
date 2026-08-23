/**
 * POST /api/correct — record a human correction for a reconciliation decision.
 *
 * Persists through the existing Prisma models: the underlying
 * ReconciliationDecision row is loaded by id, or materialised from the
 * deterministic pipeline when only a transactionId is known. Then the
 * Correction is stored and returned. No other records are touched.
 *
 * Derivation uses an OFFLINE stand-in provider so this endpoint never depends
 * on Ollama availability.
 */
import { createSafeFallback } from "../../../lib/ai/provider";
import type { AiJudgeProvider } from "../../../lib/ai/provider";
import { runReconciliation } from "../reconcile/route";
import type { DecisionResult } from "../../../lib/types";
import { getDb } from "../../../lib/correction-memory";

const VALID_DECISIONS = [
  "MATCHED",
  "REVIEW",
  "MISMATCH",
  "MISSING",
  "REFUNDED",
] as const;
type ValidDecision = (typeof VALID_DECISIONS)[number];

/** Offline stand-in: derivation must never depend on Ollama availability. */
const offlineProvider: AiJudgeProvider = {
  name: "offline-deterministic",
  judge: async (context) => createSafeFallback(context.paymentId),
};

function bad(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/**
 * Load the referenced decision row; when unknown, treat decisionId as a
 * transactionId and materialise its deterministic decision into storage.
 * Returns null when neither resolves.
 */
async function deriveOrLoadDecision(decisionId: string) {
  const db = getDb();
  const existing = await db.reconciliationDecision.findUnique({
    where: { id: decisionId },
  });
  if (existing) return existing;

  // decisionId may be a transactionId from the API responses; reuse the
  // already-materialised decision for that transaction if we made one.
  const byTransaction = await db.reconciliationDecision.findFirst({
    where: { transactionId: decisionId },
    orderBy: { createdAt: "desc" },
  });
  if (byTransaction) return byTransaction;

  const response = await runReconciliation({ provider: offlineProvider });
  const match: DecisionResult | undefined = response.decisions.find(
    (d) => d.transactionId === decisionId
  );
  if (!match) return null;

  return db.reconciliationDecision.create({
    data: {
      transactionId: match.transactionId,
      decision: match.decision,
      matchedRecordId: match.matchedRecordId,
      confidence: match.confidence,
      reason: match.reason,
      evidence: JSON.stringify(match.evidence),
      source: match.source,
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad("Malformed JSON body.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return bad("Body must be a JSON object.");
  }

  const { decisionId, correctedDecision, correctionType, explanation } =
    body as Record<string, unknown>;

  if (typeof decisionId !== "string" || decisionId.trim() === "") {
    return bad("decisionId is required.");
  }
  if (
    typeof correctedDecision !== "string" ||
    !(VALID_DECISIONS as readonly string[]).includes(correctedDecision)
  ) {
    return bad(
      `correctedDecision must be one of: ${VALID_DECISIONS.join(", ")}.`
    );
  }
  if (typeof correctionType !== "string" || correctionType.trim() === "") {
    return bad("correctionType is required.");
  }
  if (typeof explanation !== "string" || explanation.trim() === "") {
    return bad("explanation is required.");
  }

  try {
    const resolved = await deriveOrLoadDecision(decisionId);
    if (!resolved) {
      return Response.json({ error: "Decision not found." }, { status: 404 });
    }

    const db = getDb();
    const correction = await db.correction.create({
      data: {
        decisionId: resolved.id,
        originalDecision: resolved.decision,
        correctedDecision,
        correctionType,
        explanation,
      },
    });
    return Response.json({ correction }, { status: 201 });
  } catch {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}