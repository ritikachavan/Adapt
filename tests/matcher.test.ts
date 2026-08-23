// Unit tests for the deterministic matcher over tiny hand-built fixtures.
import { describe, expect, it } from "vitest";
import {
  isCanonicalReference,
  isOneEditApart,
  judgePayment,
} from "../lib/matcher";
import { buildContext } from "../lib/reconciliation";
import type {
  FinancialDataBundle,
  Order,
  Payment,
  Settlement,
} from "../lib/types";

const T0 = "2026-06-01T05:00:00.000Z";
const plusMinutes = (iso: string, m: number): string =>
  new Date(Date.parse(iso) + m * 60_000).toISOString();
const plusDays = (iso: string, d: number): string =>
  new Date(Date.parse(iso) + d * 86_400_000).toISOString();

function mkOrder(patch: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    customerId: "cust_001",
    amount: 1000,
    currency: "INR",
    createdAt: T0,
    ...patch,
  };
}
function mkPayment(patch: Partial<Payment> = {}): Payment {
  return {
    id: "pay_1",
    orderId: "ord_1",
    amount: 1000,
    status: "SETTLED",
    timestamp: plusMinutes(T0, 10),
    ...patch,
  };
}
function mkSettlement(patch: Partial<Settlement> = {}): Settlement {
  return {
    id: "stl_1",
    paymentId: "pay_1",
    amount: 1000,
    fee: 0,
    settlementDate: plusDays(T0, 1),
    ...patch,
  };
}
function bundle(
  orders: Order[] = [mkOrder()],
  payments: Payment[] = [mkPayment()],
  settlements: Settlement[] = [mkSettlement()],
  refunds: FinancialDataBundle["refunds"] = [],
  ledger: FinancialDataBundle["ledger"] = []
): FinancialDataBundle {
  return { orders, payments, settlements, refunds, ledger };
}
function judge(data: FinancialDataBundle, paymentId = "pay_1") {
  const ctx = buildContext(data);
  const payment = data.payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error(`fixture missing payment ${paymentId}`);
  return judgePayment(payment, ctx);
}

describe("reference helpers", () => {
  it("detects single-edit reference pairs", () => {
    expect(isOneEditApart("cust_007", "cust_00b")).toBe(true);
    expect(isOneEditApart("cust_001", "cust_002")).toBe(true); // adjacent numbers
    expect(isOneEditApart("cust_001", "cust_001")).toBe(false);
    expect(isOneEditApart("cust_001", "cust_999")).toBe(false); // two edits
  });

  it("classifies canonical vs malformed references", () => {
    expect(isCanonicalReference("cust_042")).toBe(true);
    expect(isCanonicalReference("cust_00b")).toBe(false);
    expect(isCanonicalReference("cus_042")).toBe(false);
  });
});

describe("judgePayment scenarios", () => {
  it("EXACT_MATCH: payment and settlement reconcile by hard id linkage", () => {
    const d = judge(bundle());
    expect(d.decision).toBe("MATCHED");
    expect(d.confidence).toBe(0.99);
    expect(d.matchedRecordId).toBe("stl_1");
    expect(d.source).toBe("DETERMINISTIC");
    expect(d.evidence.length).toBeGreaterThan(0);
  });

  it("AMOUNT_MISMATCH: records relate but amounts never reconcile", () => {
    const d = judge(
      bundle([mkOrder()], [mkPayment()], [mkSettlement({ amount: 850 })])
    );
    expect(d.decision).toBe("MISMATCH");
    expect(d.confidence).toBe(0.9);
  });

  it("MISSING_SETTLEMENT: payment captured, nothing settled", () => {
    const d = judge(bundle([mkOrder()], [mkPayment()], []));
    expect(d.decision).toBe("MISSING");
    expect(d.matchedRecordId).toBeNull();
    expect(d.confidence).toBeGreaterThan(0.9);
  });

  it("GATEWAY_FEE: shortfall equal to 2% is explained, not a mismatch", () => {
    const d = judge(
      bundle(
        [mkOrder()],
        [mkPayment()],
        [mkSettlement({ amount: 980, fee: 20 })]
      )
    );
    expect(d.decision).toBe("MATCHED");
    expect(d.confidence).toBe(0.95);
    expect(d.reason).toContain("gateway fee");
    expect(d.evidence.some((e) => e.field === "gateway.fee")).toBe(true);
  });
  it("SPLIT_SETTLEMENT: sums multiple settlements before comparing", () => {
    const d = judge(
      bundle(
        [mkOrder()],
        [mkPayment()],
        [
          mkSettlement({ amount: 600, settlementDate: plusDays(T0, 1) }),
          mkSettlement({ id: "stl_2", amount: 400, settlementDate: plusDays(T0, 2) }),
        ]
      )
    );
    expect(d.decision).toBe("MATCHED");
    expect(d.matchedRecordId).toBe("stl_1+stl_2");
    expect(d.confidence).toBe(0.97);
  });

  it("DELAYED_SETTLEMENT: late settlement explained instead of missing", () => {
    const d = judge(
      bundle(
        [mkOrder()],
        [mkPayment()],
        [mkSettlement({ settlementDate: plusDays(T0, 20) })]
      )
    );
    expect(d.decision).toBe("MATCHED");
    expect(d.confidence).toBeLessThan(0.99);
    expect(d.reason.toLowerCase()).toContain("late");
    expect(d.evidence.some((e) => e.field === "settlement.delayDays")).toBe(true);
  });

  it("REFUND: legitimate full refund detected", () => {
    const d = judge(
      bundle(
        [mkOrder()],
        [mkPayment()],
        [mkSettlement()],
        [{ id: "ref_1", paymentId: "pay_1", amount: 1000, timestamp: plusDays(T0, 4) }]
      )
    );
    expect(d.decision).toBe("REFUNDED");
    expect(d.confidence).toBe(0.97);
  });

  it("REFUND_REVERSAL: refund undone by ledger re-credit resolves to MATCHED", () => {
    const d = judge(
      bundle(
        [mkOrder()],
        [mkPayment()],
        [mkSettlement()],
        [{ id: "ref_1", paymentId: "pay_1", amount: 1000, timestamp: plusDays(T0, 4) }],
        [{ id: "led_1", referenceId: "ref_1:REVERSAL", debit: 0, credit: 1000, timestamp: plusDays(T0, 6) }]
      )
    );
    expect(d.decision).toBe("MATCHED");
    expect(d.decision).not.toBe("REFUNDED");
    expect(d.evidence.some((e) => e.field === "refund.reversed")).toBe(true);
  });

  it("partial refund is ambiguous and never auto-approved", () => {
    const d = judge(
      bundle(
        [mkOrder()],
        [mkPayment()],
        [mkSettlement()],
        [{ id: "ref_1", paymentId: "pay_1", amount: 300, timestamp: plusDays(T0, 4) }]
      )
    );
    expect(d.decision).toBe("REVIEW");
    expect(d.confidence).toBeLessThanOrEqual(0.5);
  });
  it("DUPLICATE_LOOKALIKE: same customer+amount seconds apart -> REVIEW", () => {
    const orders = [mkOrder(), mkOrder({ id: "ord_2", customerId: "cust_001" })];
    const payments = [
      mkPayment(),
      mkPayment({ id: "pay_2", orderId: "ord_2", timestamp: plusMinutes(T0, 2) }),
    ];
    const data = bundle(orders, payments, [
      mkSettlement(),
      mkSettlement({ id: "stl_2", paymentId: "pay_2" }),
    ]);
    const ctx = buildContext(data);
    const r1 = judgePayment(payments[0], ctx);
    const r2 = judgePayment(payments[1], ctx);
    expect(r1.decision).toBe("REVIEW");
    expect(r2.decision).toBe("REVIEW");
    expect(r1.evidence.some((e) => e.field === "duplicate.lookalike")).toBe(true);
  });

  it("NEAR_DUPLICATE_REFERENCE: malformed twin reference blocks approval", () => {
    const d = judge(
      bundle(
        [
          mkOrder({ customerId: "cust_007" }),
          mkOrder({ id: "ord_2", customerId: "cust_00b", amount: 750 }),
        ],
        [
          mkPayment(),
          mkPayment({ id: "pay_2", orderId: "ord_2", amount: 750 }),
        ],
        [
          mkSettlement(),
          mkSettlement({ id: "stl_2", paymentId: "pay_2", amount: 750 }),
        ]
      ),
      "pay_2"
    );
    expect(d.decision).toBe("REVIEW");
    expect(d.evidence.some((e) => e.field === "reference.nearDuplicate")).toBe(true);
  });

  it("canonical neighbours (cust_001 vs cust_002) do NOT block an exact match", () => {
    const d = judge(
      bundle(
        [
          mkOrder({ customerId: "cust_002" }),
          mkOrder({ id: "ord_2", customerId: "cust_001" }),
        ],
        [
          mkPayment(),
          mkPayment({ id: "pay_2", orderId: "ord_2" }),
        ],
        [
          mkSettlement(),
          mkSettlement({ id: "stl_2", paymentId: "pay_2" }),
        ]
      ),
      "pay_1"
    );
    expect(d.decision).toBe("MATCHED");
  });

  it("is deterministic: identical inputs produce identical decisions", () => {
    const data = bundle();
    expect(JSON.stringify(judge(data))).toBe(JSON.stringify(judge(data)));
  });

  it("confidence always stays inside [0,1]", () => {
    const samples = [
      judge(bundle()),
      judge(bundle([mkOrder()], [mkPayment()], [])),
      judge(bundle([mkOrder()], [mkPayment()], [mkSettlement({ amount: 850 })])),
    ];
    for (const d of samples) {
      expect(d.confidence).toBeGreaterThanOrEqual(0);
      expect(d.confidence).toBeLessThanOrEqual(1);
    }
  });
});