import type { ReconciliationSummary } from "./ReconciliationOverview";

interface AiMetrics {
  deterministicReviewCount: number;
  aiEscalatedCount: number;
  aiSuccessCount: number;
  aiFallbackCount: number;
  aiSkippedCount: number;
  aiEnabled: boolean;
  aiProvider: string | null;
  dualAgentEnabled: boolean;
  grokProvider: string | null;
  dualAgentAgreements: number | null;
  dualAgentDisagreements: number | null;
}

interface Decision {
  transactionId: string;
  decision: string;
  confidence: number;
  reason: string;
  matchedRecordId: string | null;
  source: string;
  evidence: Array<{ field: string; expected?: string | number | null; actual?: string | number | null; detail?: string }>;
  risk?: { score: number; level: string; signals: string[] };
  anomaly?: { isAnomalous: boolean; anomalyScore: number; severity: string | null; signals: Array<{ type: string; severity: string; title: string }> };
  resolution?: { priority: string; action: string; title: string };
}

interface Props {
  summary: ReconciliationSummary;
  aiMetrics: AiMetrics;
  decisions: Decision[];
}

/**
 * Calculate monetary exposure from exception decisions.
 * For each non-MATCHED decision, look for evidence with field "settlement.total"
 * where expected is a number (the payment amount).
 * - MISMATCH: variance = |expected - actual| (the unexplained difference)
 * - MISSING:  exposure = expected (full payment amount with no settlement)
 * - REVIEW:   exposure = expected (amount awaiting human decision)
 * - REFUNDED: exposure = 0 (refund lifecycle is expected behavior)
 *
 * Total unresolved exposure = REVIEW exposure + MISMATCH variance
 * MISSING cases are tracked separately (settlement may be delayed, not disputed).
 */
function calcExposure(decisions: Decision[]): { totalUnresolved: number; reviewExposure: number; mismatchVariance: number; missingExposure: number; byType: Record<string, number> } {
  const byType: Record<string, number> = { "Review exposure": 0, "Mismatch variance": 0, "Missing exposure": 0, Refunded: 0 };
  for (const d of decisions) {
    if (d.decision === "MATCHED") continue;
    const stl = d.evidence.find((e) => e.field === "settlement.total" && typeof e.expected === "number");
    if (!stl) continue;
    const expected = stl.expected as number;
    if (d.decision === "MISMATCH") {
      const actual = typeof stl.actual === "number" ? stl.actual : expected;
      byType["Mismatch variance"] += Math.abs(expected - actual);
    } else if (d.decision === "MISSING") {
      byType["Missing exposure"] += expected;
    } else if (d.decision === "REVIEW") {
      byType["Review exposure"] += expected;
    }
  }
  const reviewExposure = byType["Review exposure"];
  const mismatchVariance = byType["Mismatch variance"];
  const totalUnresolved = reviewExposure + mismatchVariance;
  return { totalUnresolved, reviewExposure, mismatchVariance, missingExposure: byType["Missing exposure"], byType };
}

function generateSignals(summary: ReconciliationSummary, ai: AiMetrics): string[] {
  const signals: string[] = [];
  const total = summary.total;
  if (total === 0) return signals;
  const matched = summary.byDecision?.MATCHED ?? 0;
  const reviewed = summary.byDecision?.REVIEW ?? 0;
  const mismatched = summary.byDecision?.MISMATCH ?? 0;
  const missing = summary.byDecision?.MISSING ?? 0;
  const matchRate = matched / total;
  const reviewRate = reviewed / total;
  const mismatchRate = mismatched / total;
  if (matchRate >= 0.8) signals.push("Strong match rate \u2014 most transactions reconcile automatically.");
  if (matchRate < 0.5) signals.push("Low match rate \u2014 significant manual review may be required.");
  if (reviewRate > 0.2) signals.push("High review rate \u2014 many cases need human attention.");
  if (mismatchRate > 0.05) signals.push("Elevated mismatch rate \u2014 investigate settlement discrepancies.");
  if (missing > 3) signals.push(`${missing} missing settlements \u2014 potential settlement pipeline issue.`);
  if (ai.aiFallbackCount > 0) signals.push(`${ai.aiFallbackCount} AI fallback(s) occurred \u2014 AI could not reach a verdict.`);
  if (ai.aiEnabled && ai.aiEscalatedCount > 0) {
    const isDual = ai.dualAgentEnabled && ai.grokProvider !== null;
    const agreements = ai.dualAgentAgreements ?? 0;
    const disagreements = ai.dualAgentDisagreements ?? 0;
    if (isDual) {
      if (agreements > 0) {
        signals.push(`AI investigated ${ai.aiEscalatedCount} case(s); ${agreements} reached dual-agent agreement.`);
      } else if (disagreements > 0) {
        signals.push(`AI investigated ${ai.aiEscalatedCount} case(s); ${disagreements} disagreement(s) \u2014 all require human review.`);
      } else {
        signals.push(`AI investigated ${ai.aiEscalatedCount} case(s). No agreements or disagreements recorded.`);
      }
    } else {
      signals.push(`AI investigated ${ai.aiEscalatedCount} case(s) using the available AI provider.`);
    }
  }
  if (signals.length === 0) signals.push("Reconciliation operating within normal parameters.");
  return signals;
}

function buildSummary(s: ReconciliationSummary, ai: AiMetrics): string[] {
  const total = s.total;
  if (total === 0) return ["No transactions to analyze."];
  const matched = s.byDecision?.MATCHED ?? 0;
  const reviewed = s.byDecision?.REVIEW ?? 0;
  const mismatched = s.byDecision?.MISMATCH ?? 0;
  const missing = s.byDecision?.MISSING ?? 0;
  const matchPct = Math.round((matched / total) * 100);
  const reviewPct = Math.round((reviewed / total) * 100);
  const lines: string[] = [];
  lines.push(`Reconciled ${total} transactions: ${matchPct}% deterministically auto-reconciled, ${total - matched} classified into differentiated outcomes.`);
  if (reviewed > 0) lines.push(`${reviewed} cases (${reviewPct}%) require human review due to ambiguity.`);
  if (mismatched > 0) lines.push(`${mismatched} amount mismatches and ${missing} missing settlements detected.`);
  if (ai.aiEnabled && ai.aiEscalatedCount > 0) {
    const isDual = ai.dualAgentEnabled && ai.grokProvider !== null;
    const agreements = ai.dualAgentAgreements ?? 0;
    if (isDual && agreements > 0) {
      lines.push(`AI evaluated ${ai.aiEscalatedCount} case(s); ${agreements} reached dual-agent agreement after evidence validation.`);
    } else if (isDual) {
      lines.push(`AI evaluated ${ai.aiEscalatedCount} case(s) through dual-agent verification. No agreements reached \u2014 all require human review.`);
    } else {
      lines.push(`AI evaluated ${ai.aiEscalatedCount} case(s) using the available AI provider.`);
    }
  } else if (reviewed > 0) {
    lines.push(`All ${reviewed} review-required cases are pending \u2014 AI judge was not invoked.`);
  }
  return lines;
}

export default function AuditIntelligence({ summary, aiMetrics, decisions }: Props) {
  const exposure = calcExposure(decisions);
  const signals = generateSignals(summary, aiMetrics);
  const summaryLines = buildSummary(summary, aiMetrics);
  const total = summary.total;
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
  const aiFallbackRate = aiMetrics.aiEscalatedCount > 0
    ? Math.round((aiMetrics.aiFallbackCount / aiMetrics.aiEscalatedCount) * 100)
    : 0;

  const reviewed = summary.byDecision?.REVIEW ?? 0;
  const mismatched = summary.byDecision?.MISMATCH ?? 0;
  const missing = summary.byDecision?.MISSING ?? 0;
  const refunded = summary.byDecision?.REFUNDED ?? 0;

  // Risk distribution from actual risk scores
  const riskDist = { high: 0, medium: 0, low: 0 };
  for (const d of decisions) {
    if (d.risk) {
      if (d.risk.level === "HIGH") riskDist.high++;
      else if (d.risk.level === "MEDIUM") riskDist.medium++;
      else riskDist.low++;
    }
  }

  // Anomaly distribution from actual anomaly data
  const anomalyDist = { high: 0, medium: 0, low: 0, total: 0 };
  for (const d of decisions) {
    if (d.anomaly?.isAnomalous && d.anomaly.severity) {
      anomalyDist.total++;
      if (d.anomaly.severity === "HIGH") anomalyDist.high++;
      else if (d.anomaly.severity === "MEDIUM") anomalyDist.medium++;
      else anomalyDist.low++;
    }
  }
  const anomalyRate = total > 0 ? Math.round((anomalyDist.total / total) * 100) : 0;
  // Find most common anomaly type
  const anomalyTypeCounts: Record<string, number> = {};
  for (const d of decisions) {
    if (d.anomaly?.signals) {
      for (const sig of d.anomaly.signals) {
        anomalyTypeCounts[sig.type] = (anomalyTypeCounts[sig.type] ?? 0) + 1;
      }
    }
  }
  const topAnomalyType = Object.entries(anomalyTypeCounts).sort((a, b) => b[1] - a[1])[0];

  // Resolution priority distribution
  const resolutionDist = { high: 0, medium: 0, low: 0 };
  const actionCounts: Record<string, number> = {};
  for (const d of decisions) {
    if (d.resolution) {
      if (d.resolution.priority === "HIGH") resolutionDist.high++;
      else if (d.resolution.priority === "MEDIUM") resolutionDist.medium++;
      else resolutionDist.low++;
      actionCounts[d.resolution.action] = (actionCounts[d.resolution.action] ?? 0) + 1;
    }
  }
  const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0];

  const exceptions = [
    { label: "Review", count: reviewed, pct: pct(reviewed), color: "bg-amber-500", text: "text-amber-700" },
    { label: "Mismatch", count: mismatched, pct: pct(mismatched), color: "bg-rose-500", text: "text-rose-700" },
    { label: "Missing", count: missing, pct: pct(missing), color: "bg-orange-400", text: "text-orange-700" },
    { label: "Refunded", count: refunded, pct: pct(refunded), color: "bg-sky-500", text: "text-sky-700" },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Audit intelligence">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Audit Intelligence</h2>
      </div>
      <div className="space-y-6 p-5">
        {/* Executive Summary */}
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Executive Summary</h3>
          <div className="mt-2 space-y-1">
            {summaryLines.map((line, i) => (
              <p key={i} className="text-sm leading-relaxed text-slate-800">{line}</p>
            ))}
          </div>
        </div>

        {/* Two-column: Exposure + Exception Breakdown */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Financial Exposure Requiring Investigation</h3>
            <p className="mt-1 text-[11px] text-slate-400">Total unresolved exposure = Review exposure + Mismatch variance. MISSING cases tracked separately. REFUNDED excluded.</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{'\u20B9'}{exposure.totalUnresolved.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400">Total unresolved exposure</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Review exposure</span>
                <span className="font-mono font-semibold tabular-nums text-slate-800">{'\u20B9'}{exposure.reviewExposure.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Mismatch variance</span>
                <span className="font-mono font-semibold tabular-nums text-slate-800">{'\u20B9'}{exposure.mismatchVariance.toLocaleString()}</span>
              </div>
              {exposure.missingExposure > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-400">Missing (tracked separately)</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-400">{'\u20B9'}{exposure.missingExposure.toLocaleString()}</span>
                </div>
              )}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              Calculated from settlement.total evidence: MISMATCH uses |expected − actual|, REVIEW uses expected amount. REFUNDED excluded.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exception Breakdown</h3>
            <p className="mt-1 text-[11px] text-slate-400">Distribution of non-matched decisions</p>
            <div className="mt-3 space-y-3">
              {exceptions.map((ex) => (
                <div key={ex.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${ex.text}`}>{ex.label}</span>
                    <span className="font-semibold tabular-nums text-slate-700">{ex.count} <span className="text-slate-400">({ex.pct}%)</span></span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${ex.color} transition-all duration-500`} style={{ width: `${ex.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>


        {/* Risk Distribution */}
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk Distribution</h3>
          <p className="mt-1 text-[11px] text-slate-400">These are explainable heuristic weights, not ML-trained coefficients. Risk measures investigation urgency; anomaly detection identifies unusual patterns independently.</p>
          <div className="mt-3 space-y-2">
            {[{ label: "HIGH", count: riskDist.high, color: "bg-rose-500", text: "text-rose-700" },
              { label: "MEDIUM", count: riskDist.medium, color: "bg-amber-500", text: "text-amber-700" },
              { label: "LOW", count: riskDist.low, color: "bg-emerald-500", text: "text-emerald-700" }].map((r) => {
              const max = Math.max(riskDist.high, riskDist.medium, riskDist.low, 1);
              return (
                <div key={r.label} className="flex items-center gap-3">
                  <span className={`w-16 text-xs font-semibold ${r.text}`}>{r.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${r.color}`} style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
                  </div>
                  <span className="w-8 text-right text-xs font-semibold tabular-nums text-slate-700">{r.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Anomaly Intelligence */}
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Anomaly Signals</h3>
            <span className="text-xs font-semibold tabular-nums text-slate-600">{anomalyDist.total} / {total} records with anomaly signals</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[{ label: "HIGH", count: anomalyDist.high, color: "text-rose-700", bg: "bg-rose-50" },
              { label: "MEDIUM", count: anomalyDist.medium, color: "text-amber-700", bg: "bg-amber-50" },
              { label: "LOW", count: anomalyDist.low, color: "text-blue-700", bg: "bg-blue-50" }].map((a) => (
              <div key={a.label} className={`rounded-md ${a.bg} px-2.5 py-1.5 text-center`}>
                <p className="text-[10px] font-medium text-slate-500">{a.label}</p>
                <p className={`text-sm font-bold tabular-nums ${a.color}`}>{a.count}</p>
              </div>
            ))}
          </div>
          {topAnomalyType && (
            <p className="mt-2 text-[11px] text-slate-600">Most common: <span className="font-semibold">{topAnomalyType[0].replace(/_/g, " ")}</span> ({topAnomalyType[1]})</p>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Anomaly severity measures unusual evidence patterns independently of investigation urgency. LOW means a signal was detected but combined severity is below the MEDIUM threshold.</p>

          {anomalyDist.total === 0 && (
            <p className="mt-2 text-[11px] text-emerald-700">No significant anomalies detected.</p>
          )}
        </div>

        {/* Resolution Priorities */}
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Investigation Priority</h3>
          <p className="mt-1 text-[11px] text-slate-400">Ranks how urgently a human should investigate a case.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[{ label: "HIGH", count: resolutionDist.high, color: "text-rose-700", bg: "bg-rose-50" },
              { label: "MEDIUM", count: resolutionDist.medium, color: "text-amber-700", bg: "bg-amber-50" },
              { label: "LOW", count: resolutionDist.low, color: "text-emerald-700", bg: "bg-emerald-50" }].map((r) => (
              <div key={r.label} className={`rounded-md ${r.bg} px-2.5 py-1.5 text-center`}>
                <p className="text-[10px] font-medium text-slate-500">{r.label}</p>
                <p className={`text-sm font-bold tabular-nums ${r.color}`}>{r.count}</p>
              </div>
            ))}
          </div>
          {topAction && (
            <p className="mt-2 text-[11px] text-slate-600">Most common: <span className="font-semibold">{topAction[0]}</span> ({topAction[1]})</p>
          )}
        </div>
        {/* AI Safety + Audit Signals */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI Safety</h3>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${aiMetrics.aiEnabled ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${aiMetrics.aiEnabled ? "bg-violet-500" : "bg-slate-400"}`} />
                {aiMetrics.aiEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            {aiMetrics.aiProvider && (
              <p className="mt-2 text-xs text-slate-600">Provider: <span className="font-mono font-semibold text-violet-700">{aiMetrics.aiProvider}</span></p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[{ l: "Investigations", v: aiMetrics.aiEscalatedCount, c: "text-indigo-700" },
                { l: "Agreements", v: aiMetrics.dualAgentAgreements ?? 0, c: "text-emerald-700" },
                { l: "Fallback", v: aiMetrics.aiFallbackCount, c: "text-amber-700" },
                { l: "Not Escalated", v: aiMetrics.aiSkippedCount, c: "text-slate-600" }].map((m) => (
                <div key={m.l} className="rounded-md bg-slate-50 px-2.5 py-1.5">
                  <p className="text-[10px] font-medium text-slate-500">{m.l}</p>
                  <p className={`text-sm font-bold tabular-nums ${m.c}`}>{m.v}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">AI escalation is selectively bounded. Cases beyond the investigation budget remain REVIEW.</p>
            {aiMetrics.aiEscalatedCount > 0 && (
              <p className="mt-2 text-[11px] text-slate-400">
                {aiMetrics.dualAgentAgreements ?? 0 > 0
                  ? `${aiMetrics.dualAgentAgreements} dual-agent agreements in this run.`
                  : 'No dual-agent agreements in this run.'}
              </p>
            )}
            {aiMetrics.aiFallbackCount > 0 && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-200">
                {'\u26A0'} {aiMetrics.aiFallbackCount} case{aiMetrics.aiFallbackCount > 1 ? "s" : ""} fell back to safe REVIEW. AI failures never produce MATCHED.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit Signals</h3>
            <p className="mt-1 text-[11px] text-slate-400">Deterministic observations from current data</p>
            <ul className="mt-3 space-y-2" aria-label="Audit signals">
              {signals.map((sig, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <span className="leading-snug">{sig}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
