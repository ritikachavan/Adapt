/**
 * GET /api/memory — relevant correction memory for a supplied case context.
 *
 * Query parameters (any combination):
 *   transactionId, correctionType, correctedDecision, originalDecision, limit
 *
 * With NO filter parameters the most recent corrections are returned (used by
 * the Learning screens). Otherwise results are ranked by structured relevance.
 */
import { findRelevantCorrections, getDb } from "../../../lib/correction-memory";

function serialize(
  row: Awaited<ReturnType<typeof findRelevantCorrections>>[number]
) {
  return {
    id: row.correction.id,
    decisionId: row.correction.decisionId,
    transactionId: row.transactionId,
    originalDecision: row.correction.originalDecision,
    correctedDecision: row.correction.correctedDecision,
    correctionType: row.correction.correctionType,
    explanation: row.correction.explanation,
    createdAt: row.correction.createdAt,
    score: row.score,
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const transactionId = params.get("transactionId");
    const correctionType = params.get("correctionType");
    const correctedDecision = params.get("correctedDecision");
    const originalDecision = params.get("originalDecision");
    const parsedLimit = Number(params.get("limit"));
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.floor(parsedLimit)
        : undefined;

    const hasFilters = Boolean(
      transactionId || correctionType || correctedDecision || originalDecision
    );

    // No filters -> recent corrections (feeds the Learning screens).
    if (!hasFilters) {
      const db = getDb();
      const rows = await db.correction.findMany({
        orderBy: { createdAt: "desc" },
        take: limit ?? 20,
        include: { decision: true },
      });
      return Response.json({
        count: rows.length,
        corrections: rows.map((r) => ({
          id: r.id,
          decisionId: r.decisionId,
          transactionId: r.decision?.transactionId ?? null,
          originalDecision: r.originalDecision,
          correctedDecision: r.correctedDecision,
          correctionType: r.correctionType,
          explanation: r.explanation,
          createdAt: r.createdAt,
          score: null,
        })),
      });
    }

    const matches = await findRelevantCorrections({
      ...(transactionId ? { transactionId } : {}),
      ...(correctionType ? { correctionType } : {}),
      ...(correctedDecision ? { correctedDecision } : {}),
      ...(originalDecision ? { originalDecision } : {}),
      ...(limit ? { limit } : {}),
    });

    return Response.json({
      count: matches.length,
      corrections: matches.map(serialize),
    });
  } catch {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}