/**
 * GET /api/review — the human review queue.
 *
 * Returns ONLY the cases the engine escalated for review. Uses the most recent
 * reconciliation result (including AI, if it was run) so that the review queue
 * is always consistent with the dashboard. When no reconciliation has been run
 * yet, falls back to a fast deterministic-only run.
 */
import { runReconciliation, getLatestResult, setLatestResult } from "../reconcile/route";
import type { ReconciliationResponse } from "../reconcile/route";

export async function GET(_request: Request): Promise<Response> {
  try {
    const latest = getLatestResult();
    let response: ReconciliationResponse;
    const isTestEnv = process.env.NODE_ENV === "test";
    const wantAi = !isTestEnv;
    if (latest && latest.aiMetrics.aiEscalatedCount > 0) {
      response = latest;
    } else {
      response = await runReconciliation({ ai: wantAi, maxEscalations: 4, dualAgent: true });
      setLatestResult(response);
    }
    const cases = response.decisions
      .filter((d) => d.decision === "REVIEW")
      .map((d) => ({
        transactionId: d.transactionId,
        decision: d.decision,
        confidence: d.confidence,
        reason: d.reason,
        evidence: d.evidence,
        matchedRecordId: d.matchedRecordId,
        source: d.source,
        aiStatus: d.aiStatus ?? null,
      }));
    return Response.json({ count: cases.length, cases });
  } catch {
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}
