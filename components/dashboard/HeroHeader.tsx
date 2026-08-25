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
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              ADAPT
            </h1>
            <span className="hidden text-[11px] font-medium uppercase tracking-wider text-slate-400 sm:inline">
              AI Finance Controller
            </span>
          </div>
          <p className="mt-1.5 max-w-lg text-sm text-slate-500">
            Reconcile, investigate, and resolve financial exceptions.
          </p>
          {hasData && !loading && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold ${
                aiMode ? "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200" : "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${aiMode ? "bg-violet-500" : "bg-slate-400"}`} />
                {aiMode ? "AI-assisted" : "Deterministic"}
              </span>
              {aiMode && aiProvider && (
                <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-600 ring-1 ring-inset ring-violet-200">
                  {aiProvider}
                </span>
              )}
              {aiMode && aiSuccessCount !== undefined && aiSuccessCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
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
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && !aiMode ? (
              <><Spinner /> Running…</>
            ) : (
              <><PlayIcon /> Run Reconciliation</>
            )}
          </button>
          <button
            type="button"
            onClick={onRunAI}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-violet-300 bg-white px-5 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && aiMode ? (
              <><Spinner /> AI Running…</>
            ) : (
              <><SparkleIcon /> AI Review</>
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
