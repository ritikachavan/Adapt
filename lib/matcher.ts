/**
 * ADAPT — deterministic matcher.
 *
 * Pure functions only: no AI, no I/O, no randomness, no wall-clock time.
 * Matching is by HARD ID LINKAGE (paymentId <-> settlement.paymentId);
 * reference similarity is never used to approve anything.
 */
import type {
  DecisionResult,
  EvidenceItem,
  Order,
  Payment,
  ReconciliationContext,
  ReconciliationDecision,
  Settlement,
} from "./types";

/** Standard gateway fee used by the synthetic dataset (2% of gross). */
export const FEE_RATE = 0.02;
/** Absolute paisa tolerance when recognising a fee-shaped shortfall. */
export const MAX_FEE_ABS_TOLERANCE = 0.011;
/** Settlements later than this are "delayed", not missing. */
export const MAX_NORMAL_SETTLEMENT_DELAY_DAYS = 7;
/** Two payments within this window may be double-click duplicates. */
export const DUPLICATE_LOOKALIKE_WINDOW_MS = 10 * 60 * 1000;

const DAY_MS = 86_400_000;

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function sumSettlements(list: Settlement[]): number {
  return round2(list.reduce((sum, s) => sum + s.amount, 0));
}

/** True when b differs from a by exactly one edit (substitute/insert/delete). */
export function isOneEditApart(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length === b.length) {
      i += 1;
      j += 1;
    } else if (a.length > b.length) {
      i += 1;
    } else {
      j += 1;
    }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits === 1;
}

/**
 * Canonical reference shape for ADAPT customer refs: "cust_" + digits.
 * Anything else (cust_00b, cus_042) is malformed => likely a typo.
 */
export function isCanonicalReference(ref: string): boolean {
  return /^cust_[0-9]+$/.test(ref);
}

/**
 * Same customer + same amount + close timestamp => possible double order.
 * Returns the suspicious counterpart payment, or null.
 */
export function findLookalikePayment(
  payment: Payment,
  order: Order,
  payments: Payment[],
  ordersById: Map<string, Order>
): Payment | null {
  const t = Date.parse(payment.timestamp);
  for (const other of payments) {
    if (other.id === payment.id) continue;
    const otherOrder = ordersById.get(other.orderId);
    if (!otherOrder || otherOrder.customerId !== order.customerId) continue;
    if (round2(other.amount) !== round2(payment.amount)) continue;
    const ot = Date.parse(other.timestamp);
    if (
      Number.isFinite(t) &&
      Number.isFinite(ot) &&
      Math.abs(ot - t) <= DUPLICATE_LOOKALIKE_WINDOW_MS
    ) {
      return other;
    }
  }
  return null;
}

/**
 * One-character-away customer reference on another order. Only flagged when a
 * reference is NON-canonical (malformed => likely typo). Two well-formed
 * neighbours (cust_001 vs cust_002) are legitimate; exact-ID linkage elsewhere
 * is sufficient evidence, so they do not block an approval.
 */
export function findNearDuplicateReferenceOrder(
  order: Order,
  orders: Order[]
): Order | null {
  const selfCanonical = isCanonicalReference(order.customerId);
  for (const other of orders) {
    if (other.id === order.id) continue;
    if (!isOneEditApart(order.customerId, other.customerId)) continue;
    if (!selfCanonical || !isCanonicalReference(other.customerId)) return other;
  }
  return null;
}

/** Whole days between payment and the latest settlement (0 when undatable). */
export function settlementDelayDays(
  payment: Payment,
  settlements: Settlement[]
): number {
  const paid = Date.parse(payment.timestamp);
  let maxDelay = 0;
  for (const s of settlements) {
    const settled = Date.parse(s.settlementDate);
    if (!Number.isFinite(paid) || !Number.isFinite(settled)) continue;
    maxDelay = Math.max(maxDelay, Math.floor((settled - paid) / DAY_MS));
  }
  return maxDelay;
}

// ---------------------------------------------------------------------------
// Per-payment judge — deterministic rules applied in fixed precedence order
// ---------------------------------------------------------------------------
interface Draft {
  decision: ReconciliationDecision;
  confidence: number;
  reason: string;
  matchedRecordId: string | null;
}

export function judgePayment(
  payment: Payment,
  ctx: ReconciliationContext
): DecisionResult {
  const evidence: EvidenceItem[] = [];
  const add = (
    field: string,
    expected: number | string | null,
    actual: number | string | null,
    detail?: string
  ): void => {
    evidence.push(
      detail ? { field, expected, actual, detail } : { field, expected, actual }
    );
  };
  const done = (draft: Draft): DecisionResult => ({
    transactionId: payment.id,
    decision: draft.decision,
    confidence: draft.confidence,
    reason: draft.reason,
    evidence,
    matchedRecordId: draft.matchedRecordId,
    source: "DETERMINISTIC",
  });

  const amount = round2(payment.amount);
  const order = ctx.ordersById.get(payment.orderId) ?? null;
  const settlements = ctx.settlementsByPayment.get(payment.id) ?? [];
  const refunds = ctx.refundsByPayment.get(payment.id) ?? [];
  const settleIds =
    settlements.length > 0 ? settlements.map((s) => s.id).join("+") : null;

  // 1) commercial leg --------------------------------------------------------
  if (!order) {
    add("order.link", payment.orderId, null, "No order carries this id.");
    return done({
      decision: "REVIEW",
      confidence: 0.4,
      reason: "Linked order is missing; the commercial leg cannot be verified.",
      matchedRecordId: null,
    });
  }
  if (round2(order.amount) !== amount) {
    add("amount.orderVsPayment", round2(order.amount), amount);
    return done({
      decision: "MISMATCH",
      confidence: 0.9,
      reason: `Order amount ${round2(order.amount)} does not equal payment amount ${amount}.`,
      matchedRecordId: order.id,
    });
  }

  // 2) refund lifecycle ------------------------------------------------------
  if (refunds.length > 0) {
    const grossRefunded = round2(refunds.reduce((s, r) => s + r.amount, 0));
    const reversedTotal = round2(
      refunds.reduce(
        (s, r) => s + (ctx.reversalCreditsByRefund.get(r.id) ?? 0),
        0
      )
    );
    const netRefunded = round2(grossRefunded - reversedTotal);
    add("refund.gross", amount, grossRefunded, `${refunds.length} refund record(s).`);
    if (reversedTotal > 0) {
      add("refund.reversed", grossRefunded, reversedTotal, "Ledger re-credit reverses the refund.");
    }
    if (netRefunded === amount) {
      return done({
        decision: "REFUNDED",
        confidence: settlements.length > 0 ? 0.97 : 0.85,
        reason:
          settlements.length > 0
            ? `Fully refunded ${grossRefunded} after settlement; legitimate refund lifecycle.`
            : `Fully refunded ${grossRefunded}; no settlement record required.`,
        matchedRecordId: settleIds,
      });
    }
    if (netRefunded > amount) {
      return done({
        decision: "REVIEW",
        confidence: 0.45,
        reason: `Refunded total ${netRefunded} exceeds payment ${amount}.`,
        matchedRecordId: settleIds,
      });
    }
    if (netRefunded > 0) {
      return done({
        decision: "REVIEW",
        confidence: 0.5,
        reason: `Partially refunded (${netRefunded} of ${amount}); residual treatment is ambiguous.`,
        matchedRecordId: settleIds,
      });
    }
    // netRefunded === 0 -> fully reversed; continue as an ordinary match below.
  }

  // 3) settlement leg ----------------------------------------------------------
  if (settlements.length === 0) {
    add("settlement.records", ">0", 0, "No settlement references this paymentId.");
    return done({
      decision: "MISSING",
      confidence: 0.96,
      reason: "Payment captured but no settlement record exists.",
      matchedRecordId: null,
    });
  }

  const total = sumSettlements(settlements);
  const delayDays = settlementDelayDays(payment, settlements);
  const delayed = delayDays > MAX_NORMAL_SETTLEMENT_DELAY_DAYS;

  let decision: ReconciliationDecision;
  let confidence: number;
  let reason: string;

  if (total === amount) {
    add("settlement.total", amount, total);
    confidence = settlements.length > 1 ? 0.97 : 0.99;
    reason =
      settlements.length > 1
        ? `${settlements.length} settlements sum exactly to the payment (${total}).`
        : "Settlement amount equals payment amount exactly.";
    decision = "MATCHED";
    if (delayed) {
      confidence = 0.93;
      reason += ` Settled ${delayDays} day(s) late, beyond the ${MAX_NORMAL_SETTLEMENT_DELAY_DAYS}-day window; explained rather than treated as missing.`;
      add("settlement.delayDays", MAX_NORMAL_SETTLEMENT_DELAY_DAYS, delayDays);
    }
  } else {
    const diff = round2(amount - total);
    const expectedFee = round2(amount * FEE_RATE);
    add("settlement.total", amount, total, `difference ${diff}`);
    if (diff > 0 && Math.abs(diff - expectedFee) <= MAX_FEE_ABS_TOLERANCE) {
      decision = "MATCHED";
      confidence = 0.95;
      reason = `Settlement short by ${diff}, exactly the ${(FEE_RATE * 100).toFixed(0)}% gateway fee (${expectedFee}).`;
      add("gateway.fee", expectedFee, diff, "Fee deducted at settlement.");
    } else {
      decision = "MISMATCH";
      confidence = 0.9;
      reason = `Settlement total ${total} does not reconcile with payment ${amount} (unexplained difference ${diff}).`;
    }
  }

  // 4) safety overlays — never auto-approve ambiguous cases --------------------
  if (decision === "MATCHED") {
    const lookalike = findLookalikePayment(
      payment,
      order,
      ctx.payments,
      ctx.ordersById
    );
    const nearDup = findNearDuplicateReferenceOrder(order, ctx.orders);
    const flags: string[] = [];
    if (lookalike) {
      flags.push(`possible duplicate of ${lookalike.id}`);
      add(
        "duplicate.lookalike",
        "none",
        lookalike.id,
        `Same customer ${order.customerId} and amount within ${DUPLICATE_LOOKALIKE_WINDOW_MS / 60000} minutes.`
      );
    }
    if (nearDup) {
      flags.push(`near-duplicate reference vs ${nearDup.id}`);
      add(
        "reference.nearDuplicate",
        "canonical reference",
        `${order.customerId} ~ ${nearDup.customerId}`,
        "One-character variation involving a malformed reference."
      );
    }
    if (flags.length > 0) {
      decision = "REVIEW";
      confidence = flags.length > 1 ? 0.45 : lookalike ? 0.55 : 0.5;
      reason = `Ambiguity detected: ${flags.join("; ")}. Flagged for review.`;
    }
  }

  return done({ decision, confidence, reason, matchedRecordId: settleIds });
}
