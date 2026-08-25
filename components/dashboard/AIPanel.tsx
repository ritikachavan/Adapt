interface AIPanelProps {
  aiEnabled: boolean;
  aiProvider: string | null;
  deterministicReviewCount: number;
  aiEscalatedCount: number;
  aiSuccessCount: number;
  aiFallbackCount: number;
  aiSkippedCount: number;
}

export default function AIPanel({
  aiEnabled,
  aiProvider,
  deterministicReviewCount,
  aiEscalatedCount,
  aiSuccessCount,
  aiFallbackCount,
  aiSkippedCount,
}: AIPanelProps) {
  const metrics = [
    { label: "Deterministic Reviews", value: deterministicReviewCount, color: "text-slate-800" },
    { label: "AI Escalated", value: aiEscalatedCount, color: "text-indigo-700" },
    { label: "AI Success", value: aiSuccessCount, color: "text-emerald-700" },
    { label: "AI Fallback", value: aiFallbackCount, color: "text-amber-700" },
    { label: "AI Skipped", value: aiSkippedCount, color: "text-slate-600" },
  ];

  return (
    <section className={`rounded-xl border shadow-sm ${aiEnabled ? "border-violet-200 bg-violet-50/30" : "border-slate-200 bg-white"}`}>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            AI Judge
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

        {aiProvider && (
          <div className="mt-3 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Provider</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-violet-700">
              {aiProvider}
            </p>
          </div>
        )}

        {aiEnabled && aiEscalatedCount > 0 && (
          <p className="mt-3 text-xs text-slate-600">
            {aiSuccessCount > 0
              ? `${aiSuccessCount} case${aiSuccessCount > 1 ? "s" : ""} evaluated by AI.`
              : "AI was invoked but no successful verdicts."}
            {" "}Human review remains required.
          </p>
        )}

        <div className="mt-4 space-y-2.5">
          {metrics.map((m) => (
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
