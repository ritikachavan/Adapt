import MetricCard from "./MetricCard";

export interface LearningCorrection {
  correctionType: string;
  correctedDecision: string;
}

/**
 * Learning progress from correction memory: how many human corrections have
 * been learned and which categories they fall into. No fabricated trends —
 * only counts that the API actually returned.
 */
export default function LearningProgress({
  corrections,
  loading = false,
}: {
  corrections: LearningCorrection[];
  loading?: boolean;
}) {
  const byType = new Map<string, number>();
  for (const c of corrections) {
    byType.set(c.correctionType, (byType.get(c.correctionType) ?? 0) + 1);
  }
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const max = types.length > 0 ? types[0][1] : 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Learning progress
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Learned corrections"
          value={loading ? "…" : corrections.length}
          hint="Human corrections stored in memory"
          tone="indigo"
          loading={loading}
        />
        <MetricCard
          label="Distinct correction types"
          value={loading ? "…" : types.length}
          tone="slate"
          loading={loading}
        />
      </div>

      {!loading && types.length > 0 && (
        <ul className="mt-4 space-y-2">
          {types.map(([type, count]) => (
            <li key={type} className="text-xs text-slate-600">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono">{type}</span>
                <span className="font-semibold tabular-nums">{count}</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-indigo-500"
                  style={{ width: `${max > 0 ? Math.round((count / max) * 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && types.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">
          No corrections recorded yet. Approvals made through the review screen
          will appear here as learned patterns.
        </p>
      )}
    </section>
  );
}