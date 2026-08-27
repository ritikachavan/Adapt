interface AIPanelProps {
  aiEnabled: boolean;
  aiProvider: string | null;
  deterministicReviewCount: number;
  aiEscalatedCount: number;
  aiSuccessCount: number;
  aiFallbackCount: number;
  aiSkippedCount: number;
  dualAgentEnabled?: boolean;
  grokProvider?: string | null;
  ollamaSuccesses?: number | null;
  grokSuccesses?: number | null;
  grokFailures?: number | null;
  dualAgentAgreements?: number | null;
  dualAgentDisagreements?: number | null;
}

export default function AIPanel({
  aiEnabled,
  aiProvider,
  deterministicReviewCount,
  aiEscalatedCount,
  aiSuccessCount,
  aiFallbackCount,
  aiSkippedCount,
  dualAgentEnabled,
  grokProvider,
  ollamaSuccesses,
  grokSuccesses,
  grokFailures,
  dualAgentAgreements,
  dualAgentDisagreements,
}: AIPanelProps) {
  const isDual = dualAgentEnabled && grokProvider !== null;
  const fmt = (v: number | null | undefined) => v ?? 0;
  const agreements = fmt(dualAgentAgreements);
  const disagreements = fmt(dualAgentDisagreements);

  return (
    <section className={`rounded-xl border shadow-sm ${aiEnabled ? "border-violet-200 bg-violet-50/30" : "border-slate-200 bg-white"}`}>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            AI Verification
          </h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              aiEnabled
                ? "bg-violet-100 text-violet-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                aiEnabled ? "bg-violet-500" : "bg-slate-400"
              }`}
            />
            {aiEnabled ? "Active" : "Inactive"}
          </span>
        </div>

        {/* Provider display */}
        {isDual ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Resolution Analyst</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-indigo-700">{aiProvider ?? "Ollama"}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{fmt(ollamaSuccesses)}/{aiEscalatedCount} valid responses</p>
            </div>
            <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Challenge Analyst</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-violet-700">{grokProvider}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{fmt(grokSuccesses)}/{aiEscalatedCount} valid{fmt(grokFailures) > 0 ? `, ${fmt(grokFailures)} failure${fmt(grokFailures) > 1 ? "s" : ""}` : ""}</p>
            </div>
          </div>
        ) : aiProvider ? (
          <div className="mt-3 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Provider</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-violet-700">{aiProvider}</p>
          </div>
        ) : null}

        {/* Status message */}
        {aiEnabled && aiEscalatedCount > 0 && (
          <p className="mt-3 text-xs text-slate-600">
            {isDual ? (
              <>
                {agreements > 0
                  ? `${agreements} dual-agent agreement${agreements > 1 ? "s" : ""} in this run. Evidence validated. Recommendation available for human review.`
                  : disagreements > 0
                    ? `AI produced valid analyses, but no recommendation satisfied the dual-agent agreement policy. Human review remains required.`
                    : `AI produced valid analyses. Cases remain with human review.`}
              </>
            ) : (
              <>
                {aiSuccessCount > 0
                  ? `${aiSuccessCount} case${aiSuccessCount > 1 ? "s" : ""} evaluated by AI.`
                  : "AI was invoked but no valid verdicts were produced."}
                {" "}Human review remains required.
              </>
            )}
          </p>
        )}

        {/* Metrics */}
        <div className="mt-4 space-y-2.5">
          {[
            { label: "AI Investigations", value: aiEscalatedCount, color: "text-indigo-700" },
            ...(isDual ? [
              { label: "Agreements", value: agreements, color: "text-emerald-700" },
              { label: "Disagreements", value: disagreements, color: "text-amber-700" },
            ] : [
                            { label: "Valid Responses", value: ollamaSuccesses ?? aiSuccessCount, color: "text-emerald-700" },
            ]),
            { label: "Fallbacks", value: aiFallbackCount, color: "text-amber-700" },
            { label: aiEscalatedCount > 0 ? "Not Escalated" : "Not Requested", value: aiSkippedCount, color: "text-slate-600" },
          ].map((m) => (
            <div
              key={m.label}
              className="flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100"
            >
              <span className="text-xs font-medium text-slate-600">
                {m.label}
              </span>
              <span className={`text-sm font-bold tabular-nums ${m.color}`}>
                {m.value}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-slate-400">
          AI escalation is selectively bounded. Cases beyond the investigation budget remain REVIEW and are not automatically resolved.
        </p>

        {aiFallbackCount > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-200">
            {aiFallbackCount} case{aiFallbackCount > 1 ? "s" : ""} fell back to
            safe REVIEW. AI failures never produce MATCHED.
          </p>
        )}
      </div>
    </section>
  );
}
