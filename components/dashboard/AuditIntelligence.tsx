import type { ReconciliationSummary } from "./ReconciliationOverview";

interface AiMetrics {
  deterministicReviewCount: number;
  aiEscalatedCount: number;
  aiSuccessCount: number;
  aiFallbackCount: number;
  aiSkippedCount: number;
  aiEnabled: boolean;
  aiProvider: string | null;
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
 * - MISMATCH: exposure = |expected - actual| (the unexplained difference)
 * - MISSING:  exposure = expected (full payment amount with no settlement)
 * - REVIEW:   exposure = expected (amount awaiting human decision)
 * - REFUNDED: exposure = 0 (refund lifecycle is expected behavior)
 */
function calcExposure(decisions: Decision[]): { total: number; byType: Record<string, number> } {
  const byType: Record<string, number> = { REVIEW: 0, MISMATCH: 0, MISSING: 0, REFUNDED: 0 };
  for (const d of decisions) {
    if (d.decision === "MATCHED") continue;
    const stl = d.evidence.find((e) => e.field === "settlement.total" && typeof e.expected === "number");
    if (!stl) continue;
    const expected = stl.expected as number;
    if (d.decision === "MISMATCH") {
      const actual = typeof stl.actual === "number" ? stl.actual : expected;
      byType.MISMATCH += Math.abs(expected - actual);
    } else if (d.decision === "MISSING") {
      byType.MISSING += expected;
    } else if (d.decision === "REVIEW") {
      byType.REVIEW += expected;
    }
  }
  return { total: byType.REVIEW + byType.MISMATCH + byType.MISSING + byType.REFUNDED, byType };
}

function generateSignals(summary: ReconciliationSummary, ai: AiMetrics): string[] {
  const signals: string[] = [];
  const total = summary.total;
  if (total === 0) return signals;
  const matchRate = summary.matched / total;
  const reviewRate = summary.reviewed / total;
  const mismatchRate = summary.mismatched / total;
  if (matchRate >= 0.8) signals.push("Strong match rate \u2014 most transactions reconcile automatically.");
  if (matchRate < 0.5) signals.push("Low match rate \u2014 significant manual review may be required.");
  if (reviewRate > 0.2) signals.push("High review rate \u2014 many cases need human attention.");
  if (mismatchRate > 0.05) signals.push("Elevated mismatch rate \u2014 investigate settlement discrepancies.");
  if (summary.missing > 3) signals.push(`${summary.missing} missing settlements \u2014 potential settlement pipeline issue.`);
  if (ai.aiFallbackCount > 0) signals.push(`${ai.aiFallbackCount} AI fallback(s) occurred \u2014 AI could not reach a verdict.`);
  if (ai.aiEnabled && ai.aiSuccessCount > 0) signals.push(`AI successfully resolved ${ai.aiSuccessCount} ambiguous case(s).`);
  if (signals.length === 0) signals.push("Reconciliation operating within normal parameters.");
  return signals;
}

function buildSummary(s: ReconciliationSummary, ai: AiMetrics): string[] {
  const total = s.total;
  if (total === 0) return ["No transactions to analyze."];
  const matchPct = Math.round((s.matched / total) * 100);
  const reviewPct = Math.round((s.reviewed / total) * 100);
  const lines: string[] = [];
  lines.push(`Reconciled ${total} transactions with a ${matchPct}% automatic match rate.`);
  if (s.reviewed > 0) lines.push(`${s.reviewed} cases (${reviewPct}%) require human review due to ambiguity.`);
  if (s.mismatched > 0) lines.push(`${s.mismatched} amount mismatches and ${s.missing} missing settlements detected.`);
  if (ai.aiEnabled && ai.aiEscalatedCount > 0) {
    lines.push(`AI judge evaluated ${ai.aiEscalatedCount} case(s) with ${ai.aiSuccessCount} successful verdict(s).`);
  } else if (s.reviewed > 0) {
    lines.push(`All ${s.reviewed} review cases are pending \u2014 AI judge was not invoked.`);
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


  // Risk distribution from actual risk scores
  const riskDist = { high: 0, medium: 0, low: 0 };
  for (const d of decisions) {
    if (d.risk) {
      if (d.risk.level === "HIGH") riskDist.high++;
      else if (d.risk.level === "MEDIUM") riskDist.medium++;
      else riskDist.low++;
    }
  }
  const exceptions = [
    { label: "REVIEW", count: summary.reviewed, pct: pct(summary.reviewed), color: "bg-amber-500", text: "text-amber-700" },
    { label: "MISMATCH", count: summary.mismatched, pct: pct(summary.mismatched), color: "bg-rose-500", text: "text-rose-700" },
    { label: "MISSING", count: summary.missing, pct: pct(summary.missing), color: "bg-orange-400", text: "text-orange-700" },
    { label: "REFUNDED", count: summary.refunded, pct: pct(summary.refunded), color: "bg-sky-500", text: "text-sky-700" },
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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exception Exposure</h3>
            <p className="mt-1 text-[11px] text-slate-400">Monetary value in exception categories (INR)</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{'\u20B9'}{exposure.total.toLocaleString()}</p>
            <div className="mt-3 space-y-2">
              {Object.entries(exposure.byType).filter(([, v]) => v > 0).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">{key}</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-800">{'\u20B9'}{val.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              Calculated from settlement.total evidence: MISMATCH uses |expected \u2212 actual|, MISSING/REVIEW use expected amount. REFUNDED excluded.
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
          <p className="mt-1 text-[11px] text-slate-400">ML-assisted investigation priority</p>
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
              {[{ l: "Escalated", v: aiMetrics.aiEscalatedCount, c: "text-indigo-700" },
                { l: "Success", v: aiMetrics.aiSuccessCount, c: "text-emerald-700" },
                { l: "Fallback", v: aiMetrics.aiFallbackCount, c: "text-amber-700" },
                { l: "Skipped", v: aiMetrics.aiSkippedCount, c: "text-slate-600" }].map((m) => (
                <div key={m.l} className="rounded-md bg-slate-50 px-2.5 py-1.5">
                  <p className="text-[10px] font-medium text-slate-500">{m.l}</p>
                  <p className={`text-sm font-bold tabular-nums ${m.c}`}>{m.v}</p>
                </div>
              ))}
            </div>
            {aiMetrics.aiEscalatedCount > 0 && (
              <p className="mt-2 text-[11px] text-slate-600">Fallback rate: <span className="font-semibold tabular-nums">{aiFallbackRate}%</span></p>
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




