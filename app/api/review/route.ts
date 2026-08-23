/**
 * GET /api/review — the human review queue.
 *
 * Runs the existing reconciliation pipeline and returns ONLY the cases the
 * engine escalated for review. Nothing is approved automatically and
 * deterministic decisions are never altered. If Ollama is unavailable the
 * provider's safe fallback keeps those cases in REVIEW with confidence 0.
 */
import { runReconciliation } from "../reconcile/route";

export async function GET(_request: Request): Promise<Response> {
  try {
    const response = await runReconciliation();
    const cases = response.decisions
      .filter((d) => d.decision === "REVIEW")
      .map((d) => ({
        transactionId: d.transactionId,
        decision: d.decision,
        confidence: d.confidence,
        reason: d.reason,
        evidence: d.evidence,
        matchedRecordId: d.matchedRecordId,
      }));
    return Response.json({ count: cases.length, cases });
  } catch {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}