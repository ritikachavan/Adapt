import type { ReconciliationDecision } from "@/lib/types";

const STYLES: Record<ReconciliationDecision, string> = {
  MATCHED: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  REVIEW: "bg-amber-100 text-amber-800 ring-amber-200",
  MISMATCH: "bg-rose-100 text-rose-800 ring-rose-200",
  MISSING: "bg-orange-100 text-orange-800 ring-orange-200",
  REFUNDED: "bg-sky-100 text-sky-800 ring-sky-200",
};

/** Colored status pill for any reconciliation decision value. */
export default function DecisionBadge({ decision }: { decision: string }) {
  const classes =
    STYLES[decision as ReconciliationDecision] ??
    "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${classes}`}
    >
      {decision}
    </span>
  );
}