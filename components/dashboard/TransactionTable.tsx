"use client";

import { useEffect, useState } from "react";
import DecisionBadge from "../ui/DecisionBadge";

export interface TransactionRow {
  transactionId: string;
  decision: string;
  confidence: number;
  reason: string;
  matchedRecordId: string | null;
  source: string;
  aiStatus?: "AI_SUCCESS" | "AI_FALLBACK" | "AI_SKIPPED" | "AI_NOT_REQUESTED";
  evidence: Array<{ field: string; expected?: string | number | null; actual?: string | number | null; detail?: string }>;
  anomaly?: { isAnomalous: boolean; anomalyScore: number; severity: string | null; signals: Array<{ type: string; severity: string; title: string }> };
  risk?: { score: number; level: string; signals: string[] };
  resolution?: { priority: string; action: string; title: string; rationale: string; steps: Array<{ order: number; action: string }>; supportingSignals: string[] };
}

interface Props { decisions: TransactionRow[]; onRowClick: (row: TransactionRow) => void; activeFilter?: string | null; onFilterApplied?: () => void; }

const PAGE_SIZE = 15;

export default function TransactionTable({ decisions, onRowClick, activeFilter, onFilterApplied }: Props) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("ALL");
  const [srcFilter, setSrcFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [exceptionOnly, setExceptionOnly] = useState(false);

  useEffect(() => {
    if (activeFilter) {
      if (activeFilter === "EXCEPTIONS") {
        setFilter("ALL");
        setSrcFilter("ALL");
        setExceptionOnly(true);
      } else if (activeFilter === "OLLAMA") {
        setFilter("ALL");
        setSrcFilter("OLLAMA");
        setExceptionOnly(false);
      } else {
        setFilter(activeFilter);
        setSrcFilter("ALL");
        setExceptionOnly(false);
      }
      setPage(0);
      onFilterApplied?.();
    }
  }, [activeFilter, onFilterApplied]);

  const filtered = decisions.filter((d) => {
    if (exceptionOnly && d.decision === "MATCHED") return false;
    if (filter !== "ALL" && d.decision !== filter) return false;
    if (srcFilter !== "ALL") {
      if (srcFilter === "AI_INVESTIGATED" && d.aiStatus !== "AI_SUCCESS") return false;
      if (srcFilter === "AI_SKIPPED" && d.aiStatus !== "AI_SKIPPED") return false;
      if (srcFilter === "DETERMINISTIC" && d.source !== "DETERMINISTIC") return false;
      if (srcFilter === "OLLAMA" && d.source !== "OLLAMA") return false;
    }
    if (search && !d.transactionId.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Transaction Breakdown</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" placeholder="Search ID\u2026" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-28 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          <select value={srcFilter} onChange={(e) => { setSrcFilter(e.target.value); setPage(0); }}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none">
            <option value="ALL">All Sources</option>
            <option value="DETERMINISTIC">Deterministic</option>
            <option value="OLLAMA">AI (Ollama)</option>
            <option value="AI_INVESTIGATED">AI Investigated</option>
            <option value="AI_SKIPPED">AI Skipped</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-100 px-5 py-2">
        {["ALL","MATCHED","REVIEW","MISMATCH","MISSING","REFUNDED"].map((f) => (
          <button key={f} type="button" onClick={() => { setFilter(f); setPage(0); setExceptionOnly(false); }}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${filter === f ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{f}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 bg-slate-50/50">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Transaction</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Confidence</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Matched Record</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Source</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reason</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {paged.map((d) => (
              <tr key={d.transactionId} onClick={() => onRowClick(d)} className="cursor-pointer transition hover:bg-indigo-50/50">
                <td className="whitespace-nowrap px-4 py-2.5"><span className="font-mono text-xs font-semibold text-slate-900">{d.transactionId}</span></td>
                <td className="px-4 py-2.5"><DecisionBadge decision={d.decision} /></td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right"><ConfidenceBar value={d.confidence} /></td>
                <td className="whitespace-nowrap px-4 py-2.5">{d.matchedRecordId ? <span className="font-mono text-xs text-slate-700">{d.matchedRecordId}</span> : <span className="text-xs text-slate-400">\u2014</span>}</td>
                <td className="px-4 py-2.5"><SourceBadge source={d.source} aiStatus={d.aiStatus} /></td>
                <td className="max-w-[200px] px-4 py-2.5"><p className="truncate text-xs text-slate-600" title={d.reason}>{d.reason}</p></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-500">No transactions match the selected filters.</div>}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <span className="text-xs text-slate-500">{filtered.length} \u00b7 page {page + 1}/{totalPages}</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Prev</button>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </section>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-12 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
      <span className="text-xs font-semibold tabular-nums text-slate-700">{pct}%</span>
    </div>
  );
}

function SourceBadge({ source, aiStatus }: { source: string; aiStatus?: string }) {
  if (aiStatus === "AI_SUCCESS") return <span className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-violet-100 text-violet-700">AI INVESTIGATED</span>;
  if (aiStatus === "AI_FALLBACK") return <span className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700">AI FALLBACK</span>;
  if (aiStatus === "AI_SKIPPED") return <span className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500">AI SKIPPED</span>;
  if (aiStatus === "AI_NOT_REQUESTED") return <span className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-400">AI NOT REQUESTED</span>;
  const s: Record<string, string> = { DETERMINISTIC: "bg-slate-100 text-slate-700", OLLAMA: "bg-violet-100 text-violet-700", HUMAN_REVIEW: "bg-indigo-100 text-indigo-700" };
  return <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${s[source] ?? "bg-slate-100 text-slate-600"}`}>{source}</span>;
}

