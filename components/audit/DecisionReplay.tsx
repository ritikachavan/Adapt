"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/dashboard/MetricCard";

interface ReplayEvidence {
  field: string;
  expected?: string | number | null;
  actual?: string | number | null;
  detail?: string;
}

interface ReplayData {
  transactionId: string;
  records: {
    order: Record<string, unknown> | null;
    payment: Record<string, unknown> | null;
    settlements: Array<Record<string, unknown>>;
    refunds: Array<Record<string, unknown>>;
    ledger: Array<Record<string, unknown>>;
  };
  deterministic: {
    present: boolean;
    decision?: string;
    confidence?: number;
    reason?: string;
    evidence?: ReplayEvidence[];
    matchedRecordId?: string | null;
    source?: string;
  };
  ai: {
    invoked: boolean;
    status: "NOT_INVOKED" | "EVALUATED" | "UNAVAILABLE_FALLBACK";
    message: string;
    decision?: string;
    confidence?: number;
    reason?: string;
    evidence?: ReplayEvidence[];
    source?: string;
  };
  humanReview: {
    present: boolean;
    corrections: Array<{
      id: string;
      originalDecision: string;
      correctedDecision: string;
      correctionType: string;
      explanation: string;
      createdAt: string;
    }>;
  };
  memory: {
    present: boolean;
    items: Array<{
      correctionType: string;
      originalDecision: string;
      correctedDecision: string;
      explanation: string;
      score: number;
      transactionId: string | null;
    }>;
  };
}

const STAGE_BADGES: Record<string, string> = {
  FINANCIAL: "bg-slate-100 text-slate-700 ring-slate-200",
  DETERMINISTIC: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  OLLAMA: "bg-violet-100 text-violet-800 ring-violet-200",
  HUMAN: "bg-rose-100 text-rose-800 ring-rose-200",
  MEMORY: "bg-sky-100 text-sky-800 ring-sky-200",
};

function StageBadge({ label }: { label: keyof typeof STAGE_BADGES }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${
        STAGE_BADGES[label] ?? STAGE_BADGES.FINANCIAL
      }`}
    >
      {label}
    </span>
  );
}

function pct(confidence: number | undefined): string {
  return typeof confidence === "number"
    ? `${Math.round(confidence * 100)}%`
    : "—";
}

function Kv({ k, v }: { k: string; v: string | number | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-xs uppercase tracking-wide text-slate-500">{k}</span>
      <span className="font-mono text-sm text-slate-800">
        {v === null || v === undefined || v === "" ? "—" : String(v)}
      </span>
    </div>
  );
}

function EvidenceList({
  evidence,
}: {
  evidence: ReplayEvidence[] | undefined;
}) {
  if (!evidence || evidence.length === 0)
    return (
      <p className="mt-2 text-xs italic text-slate-400">
        No structured evidence attached.
      </p>
    );
  return (
    <ul className="mt-2 space-y-2">
      {evidence.map((e, i) => (
        <li
          key={`${e.field}-${i}`}
          className="rounded-lg border border-slate-100 bg-slate-50 p-2.5"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-800">{e.field}</span>
            {"expected" in e && (
              <>
                <span className="text-slate-500">expected</span>
                <span className="font-mono text-slate-700">
                  {String(e.expected ?? "—")}
                </span>
              </>
            )}
            {"actual" in e && (
              <>
                <span className="text-slate-500">actual</span>
                <span className="font-mono text-slate-700">
                  {String(e.actual ?? "—")}
                </span>
              </>
            )}
          </div>
          {e.detail && (
            <p className="mt-1 text-xs leading-snug text-slate-600">
              {e.detail}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Stage({
  index,
  title,
  badge,
  children,
}: {
  index: number;
  title: string;
  badge: keyof typeof STAGE_BADGES;
  children: React.ReactNode;
}) {
  return (
    <li className="relative pl-11 pb-5 last:pb-0">
      <span
        aria-hidden
        className="absolute left-[15px] top-9 bottom-0 w-px bg-slate-200 last:hidden"
      />
      <span className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
        {index}
      </span>
      <details open className="group rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3.5 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
          {title}
          <StageBadge label={badge} />
          <span className="ml-auto text-xs font-normal text-indigo-600 group-open:hidden">
            expand
          </span>
          <span className="ml-auto hidden text-xs font-normal text-slate-400 group-open:inline">
            collapse
          </span>
        </summary>
        <div className="border-t border-slate-100 p-4">{children}</div>
      </details>
    </li>
  );
}

/**
 * Decision Replay — vertical evidence timeline for ONE selected transaction.
 * Self-fetching: given a transactionId it loads GET /api/audit and renders the
 * five honest stages (records → deterministic → AI → human → memory).
 */
export default function DecisionReplay({
  transactionId,
}: {
  transactionId: string | null;
}) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    setNotFound(false);
    if (!transactionId) return;

    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/audit?transactionId=${encodeURIComponent(transactionId)}`
        );
        if (res.status === 404) {
          if (alive) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body = (await res.json()) as ReplayData;
        if (alive) setData(body);
      } catch {
        if (alive) setError("Could not load the decision replay.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [transactionId]);

  if (!transactionId) return null;

  if (loading)
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Decision Replay</h3>
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-slate-100"
            />
          ))}
        </div>
      </section>
    );

  if (notFound || error || !data)
    return (
      <section className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
        {notFound
          ? "Transaction not found — nothing to replay."
          : (error ?? "Replay unavailable.")}
      </section>
    );

  const det = data.deterministic;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Decision Replay</h3>
        <span className="font-mono text-xs text-slate-500">
          {data.transactionId}
        </span>
      </header>

      <ol className="mt-5">
        <Stage index={1} title="Financial records" badge="FINANCIAL">
          {(() => {
            const o = data.records.order as Record<string, string | number> | null;
            const p = data.records.payment as Record<string, string | number> | null;
            return (
              <div className="space-y-3">
                {o && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600">Order</p>
                    <Kv k="id" v={String(o.id)} />
                    <Kv k="customer" v={String(o.customerId)} />
                    <Kv k="amount" v={`${o.amount} ${o.currency ?? ""}`} />
                  </div>
                )}
                {p && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600">Payment</p>
                    <Kv k="id" v={String(p.id)} />
                    <Kv k="status" v={String(p.status)} />
                    <Kv k="amount" v={Number(p.amount)} />
                    <Kv k="timestamp" v={String(p.timestamp)} />
                  </div>
                )}
                {data.records.settlements.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      Settlements ({data.records.settlements.length})
                    </p>
                    {data.records.settlements.map((s) => (
                      <Kv
                        key={String(s.id)}
                        k={String(s.id)}
                        v={`amount ${s.amount} · fee ${s.fee}`}
                      />
                    ))}
                  </div>
                )}
                {data.records.refunds.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      Refunds ({data.records.refunds.length})
                    </p>
                    {data.records.refunds.map((r) => (
                      <Kv key={String(r.id)} k={String(r.id)} v={`amount ${r.amount}`} />
                    ))}
                  </div>
                )}
                {data.records.ledger.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      Ledger lines ({data.records.ledger.length})
                    </p>
                    {data.records.ledger.slice(0, 4).map((l) => (
                      <Kv
                        key={String(l.id)}
                        k={String(l.referenceId)}
                        v={`D ${l.debit} / C ${l.credit}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </Stage>

        <Stage index={2} title="Deterministic reconciliation" badge="DETERMINISTIC">
          {det.present ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  {det.decision}
                </span>
                <span className="font-semibold tabular-nums text-slate-700">
                  {pct(det.confidence)} confidence
                </span>
                {det.matchedRecordId && (
                  <span className="font-mono text-xs text-slate-400">
                    {det.matchedRecordId}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {det.reason}
              </p>
              <EvidenceList evidence={det.evidence} />
            </>
          ) : (
            <p className="text-sm text-slate-500">
              The deterministic engine did not produce a decision for this
              transaction.
            </p>
          )}
        </Stage>

        <Stage index={3} title="AI judge" badge="OLLAMA">
          {data.ai.status === "EVALUATED" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-200">
                  {data.ai.decision}
                </span>
                <span className="font-semibold tabular-nums text-slate-700">
                  {pct(data.ai.confidence)} confidence
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {data.ai.reason}
              </p>
              <EvidenceList evidence={data.ai.evidence as ReplayEvidence[]} />
            </>
          ) : data.ai.status === "UNAVAILABLE_FALLBACK" ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
              AI unavailable — human review required.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-slate-600">
              {data.ai.message}
            </p>
          )}
        </Stage>

        <Stage index={4} title="Human review" badge="HUMAN">
          {data.humanReview.present ? (
            <ul className="space-y-3">
              {data.humanReview.corrections.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wide text-rose-700">
                      {c.correctionType}
                    </span>
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 font-medium text-slate-700">
                      {c.originalDecision}
                    </span>
                    <span aria-hidden className="text-slate-400">
                      →
                    </span>
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-700">
                      {c.correctedDecision}
                    </span>
                    {c.createdAt && (
                      <time className="ml-auto text-[11px] text-slate-400">
                        {new Date(c.createdAt).toLocaleString()}
                      </time>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm leading-snug text-slate-700">
                    {c.explanation}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No human correction recorded for this transaction.
            </p>
          )}
        </Stage>

        <Stage index={5} title="Correction memory" badge="MEMORY">
          {data.memory.present ? (
            <ul className="space-y-3">
              {data.memory.items.map((m, i) => (
                <li
                  key={`${m.correctionType}-${i}`}
                  className="rounded-lg border border-sky-100 bg-sky-50 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wide text-sky-800">
                      {m.correctionType}
                    </span>
                    <span className="rounded bg-white px-1.5 py-0.5 font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                      {m.originalDecision} → {m.correctedDecision}
                    </span>
                    <span className="ml-auto rounded-full bg-white px-2 py-0.5 font-semibold tabular-nums text-sky-700 ring-1 ring-inset ring-sky-200">
                      {Math.round(m.score * 100)}% match
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-snug text-slate-700">
                    {m.explanation}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic text-slate-500">
              No relevant correction-memory records for this transaction yet.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-snug text-slate-400">
            Surfaced by rule-based recall over stored corrections. Storage here
            does not imply that memory influenced the original decision.
          </p>
        </Stage>
      </ol>
    </section>
  );
}