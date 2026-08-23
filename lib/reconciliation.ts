/**
 * ADAPT — reconciliation pipeline.
 * Builds lookup indexes over an in-memory bundle, judges every payment with
 * the deterministic matcher, and emits a stable, reproducible report.
 * No AI, no database, no side effects.
 */
import type {
  FinancialDataBundle,
  ReconciliationContext,
  ReconciliationDecision,
  ReconciliationReport,
} from "./types";
import { judgePayment } from "./matcher";

const REVERSAL_SUFFIX = ":REVERSAL";

/** Index the bundle once so per-payment judging stays cheap and pure. */
export function buildContext(data: FinancialDataBundle): ReconciliationContext {
  const ordersById = new Map<string, import("./types").Order>();
  for (const o of data.orders) ordersById.set(o.id, o);

  const settlementsByPayment = new Map<string, import("./types").Settlement[]>();
  for (const s of data.settlements) {
    const list = settlementsByPayment.get(s.paymentId) ?? [];
    list.push(s);
    settlementsByPayment.set(s.paymentId, list);
  }

  const refundsByPayment = new Map<string, import("./types").Refund[]>();
  for (const r of data.refunds) {
    const list = refundsByPayment.get(r.paymentId) ?? [];
    list.push(r);
    refundsByPayment.set(r.paymentId, list);
  }

  // Ledger re-credits reverse refunds: referenceId "<refundId>:REVERSAL".
  const reversalCreditsByRefund = new Map<string, number>();
  for (const entry of data.ledger) {
    if (!entry.referenceId.endsWith(REVERSAL_SUFFIX)) continue;
    const refundId = entry.referenceId.slice(0, -REVERSAL_SUFFIX.length);
    reversalCreditsByRefund.set(
      refundId,
      (reversalCreditsByRefund.get(refundId) ?? 0) + entry.credit
    );
  }

  return {
    ordersById,
    settlementsByPayment,
    refundsByPayment,
    reversalCreditsByRefund,
    payments: data.payments,
    orders: data.orders,
  };
}

/** Run deterministic reconciliation over the whole bundle. */
export function reconcile(data: FinancialDataBundle): ReconciliationReport {
  const ctx = buildContext(data);
  const decisions = data.payments
    .map((payment) => judgePayment(payment, ctx))
    .sort((a, b) =>
      a.transactionId < b.transactionId
        ? -1
        : a.transactionId > b.transactionId
          ? 1
          : 0
    );

  const byDecision = Object.fromEntries(
    (
      ["MATCHED", "REVIEW", "MISMATCH", "MISSING", "REFUNDED"] as const
    ).map((d) => [d, 0])
  ) as Record<ReconciliationDecision, number>;
  for (const d of decisions) byDecision[d.decision] += 1;

  return {
    decisions,
    summary: { total: decisions.length, byDecision },
  };
}
