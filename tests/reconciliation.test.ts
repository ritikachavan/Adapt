// Unit tests for the reconcile() pipeline over small in-memory bundles.
// The JSON dataset is never read — everything here is hand-built fixtures.
import { describe, expect, it } from "vitest";
import { reconcile } from "../lib/reconciliation";
import type {
  FinancialDataBundle,
  Order,
  Payment,
  ReconciliationDecision,
  Settlement,
} from "../lib/types";

const T0 = "2026-06-01T05:00:00.000Z";
const plusMinutes = (iso: string, m: number): string =>
  new Date(Date.parse(iso) + m * 60_000).toISOString();
const plusDays = (iso: string, d: number): string =>
  new Date(Date.parse(iso) + d * 86_400_000).toISOString();

function mkOrder(id: string, patch: Partial<Order> = {}): Order {
  return {
    id,
    customerId: `cust_${id.replace(/[^0-9]/g, "")}`,
    amount: 500,
    currency: "INR",
    createdAt: T0,
    ...patch,
  };
}
function mkPayment(id: string, orderId: string, patch: Partial<Payment> = {}): Payment {
  return {
    id,
    orderId,
    amount: 500,
    status: "SETTLED",
    timestamp: plusMinutes(T0, 10),
    ...patch,
  };
}
function mkSettlement(id: string, paymentId: string): Settlement {
  return {
    id,
    paymentId,
    amount: 500,
    fee: 0,
    settlementDate: plusDays(T0, 1),
  };
}

const VALID_DECISIONS: ReconciliationDecision[] = [
  "MATCHED",
  "REVIEW",
  "MISMATCH",
  "MISSING",
  "REFUNDED",
];

describe("reconcile pipeline", () => {
  it("summarises a mixed bundle correctly", () => {
    const data: FinancialDataBundle = {
      orders: [
        mkOrder("ord_1"),
        mkOrder("ord_2"),
        mkOrder("ord_3"),
        mkOrder("ord_4"),
      ],
      payments: [
        mkPayment("pay_1", "ord_1"), // exact -> MATCHED
        mkPayment("pay_2", "ord_2"), // no settlement -> MISSING
        mkPayment("pay_3", "ord_3"), // refunded -> REFUNDED
        mkPayment("pay_4", "ord_4"), // short settlement, no fee -> MISMATCH
      ],
      settlements: [
        mkSettlement("stl_1", "pay_1"),
        mkSettlement("stl_3", "pay_3"),
        { ...mkSettlement("stl_4b", "pay_4"), amount: 450 },
      ],
      refunds: [
        { id: "ref_1", paymentId: "pay_3", amount: 500, timestamp: plusDays(T0, 3) },
      ],
      ledger: [],
    };

    const report = reconcile(data);
    expect(report.summary.total).toBe(4);
    expect(report.summary.byDecision.MATCHED).toBe(1);
    expect(report.summary.byDecision.MISSING).toBe(1);
    expect(report.summary.byDecision.REFUNDED).toBe(1);
    expect(report.summary.byDecision.MISMATCH).toBe(1);
    expect(report.summary.byDecision.REVIEW).toBe(0);
    const byId = Object.fromEntries(
      report.decisions.map((d) => [d.transactionId, d])
    );
    expect(byId.pay_1.decision).toBe("MATCHED");
    expect(byId.pay_2.decision).toBe("MISSING");
    expect(byId.pay_3.decision).toBe("REFUNDED");
    expect(byId.pay_4.decision).toBe("MISMATCH");
  });

  it("returns decisions sorted by transactionId regardless of input order", () => {
    const data: FinancialDataBundle = {
      orders: [mkOrder("ord_1"), mkOrder("ord_2")],
      payments: [mkPayment("pay_2", "ord_2"), mkPayment("pay_1", "ord_1")],
      settlements: [
        mkSettlement("stl_1", "pay_1"),
        mkSettlement("stl_2", "pay_2"),
      ],
      refunds: [],
      ledger: [],
    };
    const ids = reconcile(data).decisions.map((d) => d.transactionId);
    expect(ids).toEqual(["pay_1", "pay_2"]);
  });
  it("routes duplicate lookalikes to REVIEW instead of approving them", () => {
    const data: FinancialDataBundle = {
      orders: [
        mkOrder("ord_1", { customerId: "cust_777", amount: 800 }),
        mkOrder("ord_2", { customerId: "cust_777", amount: 800 }),
      ],
      payments: [
        mkPayment("pay_1", "ord_1", { amount: 800 }),
        mkPayment("pay_2", "ord_2", { amount: 800, timestamp: plusMinutes(T0, 2) }),
      ],
      settlements: [
        { ...mkSettlement("stl_1", "pay_1"), amount: 800 },
        { ...mkSettlement("stl_2", "pay_2"), amount: 800 },
      ],
      refunds: [],
      ledger: [],
    };
    const report = reconcile(data);
    expect(report.summary.byDecision.REVIEW).toBe(2);
    expect(report.summary.byDecision.MATCHED).toBe(0);
  });

  it("emits structurally valid decisions and is reproducible run-to-run", () => {
    const data: FinancialDataBundle = {
      orders: [mkOrder("ord_1")],
      payments: [
        mkPayment("pay_1", "ord_1"),
        mkPayment("pay_9", "ord_99"), // dangling order link
      ],
      settlements: [mkSettlement("stl_1", "pay_1")],
      refunds: [],
      ledger: [],
    };
    const first = reconcile(data);
    const second = reconcile(data);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    expect(first.summary.total).toBe(2);
    for (const d of first.decisions) {
      expect(VALID_DECISIONS).toContain(d.decision);
      expect(d.confidence).toBeGreaterThanOrEqual(0);
      expect(d.confidence).toBeLessThanOrEqual(1);
      expect(d.source).toBe("DETERMINISTIC");
      expect(typeof d.reason).toBe("string");
      expect(Array.isArray(d.evidence)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(d, "matchedRecordId")).toBe(true);
    }
    // the dangling-order payment must be escalated, not approved
    const pay9 = first.decisions.find((d) => d.transactionId === "pay_9");
    expect(pay9?.decision).toBe("REVIEW");
  });

  it("handles an empty bundle without drama", () => {
    const report = reconcile({
      orders: [],
      payments: [],
      settlements: [],
      refunds: [],
      ledger: [],
    });
    expect(report.summary.total).toBe(0);
    expect(report.summary.byDecision.MATCHED).toBe(0);
    expect(report.decisions).toEqual([]);
  });
});