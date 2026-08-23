import LearnedPattern, {
  type LearnedPatternItem,
} from "../learning/LearnedPattern";

/**
 * Correction memory browser: every stored human correction with a short
 * explanation of how memory is used later.
 */
export default function CorrectionMemory({
  items,
  loading = false,
  error = null,
}: {
  items: LearnedPatternItem[];
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Correction memory
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
        Every correction recorded on the review screen is stored as a learned
        pattern. When future ambiguous cases look structurally similar — same
        transaction, same mistake category, or same remediation direction — these
        patterns are surfaced to reviewers first. Matching is deterministic and
        rule-based; nothing is inferred or invented.
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-slate-200"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No corrections learned yet. Approve or correct cases on the review
          screen and they will appear here.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <LearnedPattern key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}