"use client";

import { useCallback, useRef, useState } from "react";

interface AskResponse {
  answer: string;
  evidence: string[];
  recommendation: string | null;
  source: string;
  aiProvider: string | null;
}

const SUGGESTIONS = [
  "Where did the money from pay_0010 go?",
  "Why is pay_0010 under review?",
  "What are the highest-risk transactions?",
  "Which settlements have the largest variance?",
  "What changed in the current dataset?",
];

export default function AskAdapt() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ask = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q.trim() }) });
      if (!res.ok) { const err = (await res.json()) as { error?: string }; setError(err.error || "Request failed"); return; }
      setResult((await res.json()) as AskResponse);
    } catch { setError("Could not reach the Ask Adapt API."); } finally { setLoading(false); }
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => { e.preventDefault(); void ask(question); }, [question, ask]);
  const handleSuggestion = useCallback((s: string) => { setQuestion(s); void ask(s); }, [ask]);

  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        Ask Adapt
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Ask Adapt</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200">Local AI · Ollama</span>
        </div>
        <button type="button" onClick={() => { setOpen(false); setResult(null); setError(null); }} aria-label="Close Ask Adapt"
          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
        <input ref={inputRef} type="text" value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your financial data…" disabled={loading}
          className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
        <button type="submit" disabled={loading || !question.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {!result && !loading && !error && (
        <div className="px-5 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Try asking</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => handleSuggestion(s)}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="px-5 py-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm font-medium text-rose-800">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4 px-5 py-4">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Answer</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-800">{result.answer}</p>
          </div>
          {result.evidence.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Evidence</h3>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.evidence.map((ev) => (
                  <span key={ev} className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{ev}</span>
                ))}
              </div>
            </div>
          )}
          {result.recommendation && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recommendation</h3>
              <p className="mt-1.5 text-sm text-indigo-700">{result.recommendation}</p>
            </div>
          )}
          <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
            <span className="text-[10px] text-slate-400">Source: {result.source}</span>
            {result.aiProvider && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">AI: {result.aiProvider}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
