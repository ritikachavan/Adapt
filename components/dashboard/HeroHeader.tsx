"use client";

interface HeroHeaderProps {
  onRunDeterministic: () => void;
  onRunAI: () => void;
  loading: boolean;
  aiMode: boolean;
  hasData: boolean;
  aiProvider?: string | null;
  aiSuccessCount?: number;
}

export default function HeroHeader({
  onRunDeterministic,
  onRunAI,
  loading,
  aiMode,
  hasData,
  aiProvider,
  aiSuccessCount,
}: HeroHeaderProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Financial Reconciliation &amp; Control Intelligence
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            ADAPT
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
            Turn reconciliation exceptions into explainable, risk-prioritized investigations.
          </p>
          {hasData && !loading && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                aiMode ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${aiMode ? "bg-violet-500" : "bg-slate-400"}`} />
                {aiMode ? "AI-assisted" : "Deterministic"}
              </span>
              {aiMode && aiProvider && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
                  {aiProvider}
                </span>
              )}
              {aiMode && aiSuccessCount !== undefined && aiSuccessCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  {aiSuccessCount} AI decision{aiSuccessCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onRunDeterministic}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && !aiMode ? (
              <>
                <Spinner />
                Running…
              </>
            ) : (
              <>
                <PlayIcon />
                Run Reconciliation
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onRunAI}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-6 py-3 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && aiMode ? (
              <>
                <Spinner />
                AI Running…
              </>
            ) : (
              <>
                <SparkleIcon />
                AI Review
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
    </svg>
  );
}
