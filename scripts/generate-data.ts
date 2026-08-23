/**
 * ADAPT — Adaptive AI Finance Controller
 * Synthetic data generator (deterministic, fixed seed).
 *
 * Fully synthetic INR dataset. No AI, no network, no database writes, no
 * wall-clock time — running twice produces byte-identical output.
 *
 * Outputs -> ../data: orders.json(100) payments.json(100) settlements.json(100)
 *             refunds.json(25) ledger.json(100) ground-truth.json(100 cases)
 *
 * Unit = one order + one payment. Mix engineered so record counts hit exactly
 * 100/100/100/25/100 (MISSING removes settlements, SPLIT adds them back):
 *   NORMAL_MATCH 44 · MISSING_SETTLEMENT 4 · AMOUNT_MISMATCH 4 · GATEWAY_FEE 6
 *   DELAYED_SETTLEMENT 4 · SPLIT_SETTLEMENT 4 · REFUND 21 · REFUND_REVERSAL 4
 *   DUPLICATE_LOOKALIKE 3 pairs (=6 units) · NEAR_DUPLICATE_REFERENCE 3
 *
 * Ledger policy (exactly 100 lines):
 *   - 1 CREDIT per settled non-refunded payment (split parts merged): 71
 *   - 1 DEBIT per refund: 25
 *   - 1 reversal CREDIT per refund reversal ("<refundId>:REVERSAL"): 4
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — the ONLY source of variation.
// ---------------------------------------------------------------------------
const SEED = 20260823;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const randInt = (lo: number, hi: number): number =>
  lo + Math.floor(rand() * (hi - lo + 1));
const pickFrom = <T>(items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)];
const round2 = (v: number): number => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Types (mirror prisma/schema.prisma models)
// ---------------------------------------------------------------------------
type Scenario =
  | "NORMAL_MATCH"
  | "MISSING_SETTLEMENT"
  | "AMOUNT_MISMATCH"
  | "GATEWAY_FEE"
  | "DUPLICATE_LOOKALIKE"
  | "DELAYED_SETTLEMENT"
  | "SPLIT_SETTLEMENT"
  | "REFUND"
  | "REFUND_REVERSAL"
  | "NEAR_DUPLICATE_REFERENCE";

type ExpectedDecision = "MATCHED" | "UNMATCHED" | "REVIEW";

interface Order {
  id: string;
  customerId: string;
  amount: number;
  currency: string;
  createdAt: string;
}
interface Payment {
  id: string;
  orderId: string;
  amount: number;
  status: string; // SETTLED | PENDING | REFUNDED
  timestamp: string;
}
interface Settlement {
  id: string;
  paymentId: string;
  amount: number;
  fee: number;
  settlementDate: string;
}
interface Refund {
  id: string;
  paymentId: string;
  amount: number;
  timestamp: string;
}
interface LedgerEntry {
  id: string;
  referenceId: string;
  debit: number;
  credit: number;
  timestamp: string;
}
interface GroundTruthCase {
  caseId: string;
  orderId: string;
  paymentId: string;
  scenario: Scenario;
  expectedDecision: ExpectedDecision;
  expectedOutcome: string;
  reviewRequired: boolean;
  relatedOrderId: string | null;
  note: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BASE_MS = Date.UTC(2026, 5, 1, 4, 30, 0); // 2026-06-01 10:00 IST (fixed clock)
const HOUR = 3_600_000;
const DAY = 86_400_000;

const iso = (ms: number): string => new Date(ms).toISOString();
const idOf = (prefix: string, n: number): string =>
  `${prefix}_${String(n).padStart(4, "0")}`;

/** Realistic Indian e-commerce price points (INR). */
const PRICES: readonly number[] = [
  149, 199, 249, 299, 349, 399, 449, 499, 599, 699, 799, 899, 999, 1299, 1499,
  1799, 1999, 2499, 2999, 3499, 3999, 4499, 4999, 5999, 6999, 7999, 9999,
  12499, 14999, 19999, 24999, 29999, 39999, 49999,
];

/** 60 repeat-buying customers so lookalike activity occurs naturally. */
const CUSTOMERS: readonly string[] = Array.from(
  { length: 60 },
  (_, k) => `cust_${String(k + 1).padStart(3, "0")}`
);

/** Expected outcome per scenario (coarse decision + specific outcome label). */
const GT_META: Record<
  Scenario,
  { decision: ExpectedDecision; outcome: string; review: boolean; note: string }
> = {
  NORMAL_MATCH: {
    decision: "MATCHED", outcome: "FULL_MATCH", review: false,
    note: "Order, payment and settlement agree exactly.",
  },
  MISSING_SETTLEMENT: {
    decision: "UNMATCHED", outcome: "PAYMENT_WITHOUT_SETTLEMENT", review: false,
    note: "Payment captured but no settlement record exists.",
  },
  AMOUNT_MISMATCH: {
    decision: "REVIEW", outcome: "SETTLEMENT_AMOUNT_MISMATCH", review: true,
    note: "Settlement amount deviates from payment amount.",
  },
  GATEWAY_FEE: {
    decision: "MATCHED", outcome: "MATCHED_AFTER_GATEWAY_FEE", review: false,
    note: "Settlement equals payment minus a 2% gateway fee.",
  },
  DUPLICATE_LOOKALIKE: {
    decision: "REVIEW", outcome: "POSSIBLE_DUPLICATE_PAIR", review: true,
    note: "Same customer and amount seconds apart - possible double order.",
  },
  DELAYED_SETTLEMENT: {
    decision: "MATCHED", outcome: "MATCHED_LATE_SETTLEMENT", review: false,
    note: "Settlement arrived 16-40 days after payment.",
  },
  SPLIT_SETTLEMENT: {
    decision: "MATCHED", outcome: "MATCHED_SPLIT_SETTLEMENT", review: false,
    note: "Two settlements sum exactly to the payment.",
  },
  REFUND: {
    decision: "MATCHED", outcome: "MATCHED_WITH_FULL_REFUND", review: false,
    note: "Payment settled, then fully refunded.",
  },
  REFUND_REVERSAL: {
    decision: "MATCHED", outcome: "MATCHED_REFUND_REVERSED", review: false,
    note: "Refund issued and later reversed via ledger re-credit.",
  },
  NEAR_DUPLICATE_REFERENCE: {
    decision: "REVIEW", outcome: "NEAR_DUPLICATE_REFERENCE", review: true,
    note: "Customer reference differs from another order by one character.",
  },
};

// ---------------------------------------------------------------------------
// Scenario plan — 100 units, shuffled deterministically (seeded Fisher-Yates)
// ---------------------------------------------------------------------------
const MIX: ReadonlyArray<readonly [Scenario, number]> = [
  ["NORMAL_MATCH", 44],
  ["MISSING_SETTLEMENT", 4],
  ["AMOUNT_MISMATCH", 4],
  ["GATEWAY_FEE", 6],
  ["DELAYED_SETTLEMENT", 4],
  ["SPLIT_SETTLEMENT", 4],
  ["REFUND", 21],
  ["REFUND_REVERSAL", 4],
  ["DUPLICATE_LOOKALIKE", 6], // 3 pairs -> 6 units
  ["NEAR_DUPLICATE_REFERENCE", 3],
];

const plan: Scenario[] = [];
for (const [scenario, count] of MIX) {
  for (let k = 0; k < count; k++) plan.push(scenario);
}
for (let i = plan.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [plan[i], plan[j]] = [plan[j], plan[i]];
}

// ---------------------------------------------------------------------------
// Mutable state
// ---------------------------------------------------------------------------
const orders: Order[] = [];
const payments: Payment[] = [];
const settlements: Settlement[] = [];
const refunds: Refund[] = [];
const ledger: LedgerEntry[] = [];
const groundTruth: GroundTruthCase[] = [];

let ordN = 0;
let payN = 0;
let stlN = 0;
let refN = 0;
let ledN = 0;
let clock = BASE_MS;

interface TwinContext {
  orderId: string;
  customerId: string;
  amount: number;
  createdAtMs: number;
}
const paymentsById = new Map<string, Payment>();
const settlementsByPayment = new Map<string, Settlement[]>();
const refundedPaymentIds = new Set<string>();
const gtByOrder = new Map<string, GroundTruthCase>();
let pendingTwin: TwinContext | null = null;

/** Corrupt one character of a customer reference (typo simulation). */
function corruptCustomerId(id: string): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz0123456789";
  const chars = id.split("");
  const pos = randInt(5, chars.length - 1); // after "cust_"
  let replacement = alphabet[randInt(0, alphabet.length - 1)];
  if (replacement === chars[pos]) {
    replacement =
      alphabet[(alphabet.indexOf(replacement) + 1) % alphabet.length];
  }
  chars[pos] = replacement;
  const out = chars.join("");
  return out === id ? `${id.slice(0, -1)}x` : out;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
for (let idx = 0; idx < plan.length; idx++) {
  const scenario: Scenario = plan[idx];
  const caseNo = idx + 1;

  ordN += 1;
  payN += 1;
  const orderId = idOf("ord", ordN);
  const paymentId = idOf("pay", payN);

  clock += randInt(2, 9) * HOUR;
  let customerId = pickFrom(CUSTOMERS);
  let amount = pickFrom(PRICES);
  let createdAt = clock;
  let relatedOrderId: string | null = null;

  if (scenario === "DUPLICATE_LOOKALIKE") {
    if (pendingTwin) {
      // This unit is the near-identical twin of an earlier order.
      customerId = pendingTwin.customerId;
      amount = pendingTwin.amount;
      relatedOrderId = pendingTwin.orderId;
      createdAt = pendingTwin.createdAtMs + randInt(90, 240) * 1000;
      clock = Math.max(clock, createdAt + HOUR);
      const twinGt = gtByOrder.get(pendingTwin.orderId);
      if (twinGt) twinGt.relatedOrderId = orderId;
      pendingTwin = null;
    } else {
      pendingTwin = { orderId, customerId, amount, createdAtMs: createdAt };
    }
  } else if (scenario === "NEAR_DUPLICATE_REFERENCE" && orders.length > 0) {
    const donor = orders[randInt(0, orders.length - 1)];
    customerId = corruptCustomerId(donor.customerId);
    relatedOrderId = donor.id;
    const donorGt = gtByOrder.get(donor.id);
    if (donorGt) donorGt.relatedOrderId = orderId;
    let alt = pickFrom(PRICES);
    while (alt === amount) alt = pickFrom(PRICES); // different value on purpose
    amount = alt;
  }

  orders.push({
    id: orderId,
    customerId,
    amount,
    currency: "INR",
    createdAt: iso(createdAt),
  });

  const paidAt = createdAt + randInt(2, 20) * 60_000;
  const payment: Payment = {
    id: paymentId,
    orderId,
    amount,
    status: scenario === "MISSING_SETTLEMENT" ? "PENDING" : "SETTLED",
    timestamp: iso(paidAt),
  };
  payments.push(payment);
  paymentsById.set(paymentId, payment);

  const addSettlement = (
    amt: number,
    feeAmt: number,
    daysLater: number,
    seq: number
  ): void => {
    stlN += 1;
    const s: Settlement = {
      id: idOf("stl", stlN),
      paymentId,
      amount: round2(amt),
      fee: round2(feeAmt),
      settlementDate: iso(paidAt + daysLater * DAY + seq * 60_000),
    };
    settlements.push(s);
    const list = settlementsByPayment.get(paymentId) ?? [];
    list.push(s);
    settlementsByPayment.set(paymentId, list);
  };

  const settleDays =
    scenario === "DELAYED_SETTLEMENT" ? randInt(16, 40) : randInt(1, 3);

  switch (scenario) {
    case "MISSING_SETTLEMENT":
      break; // no settlement record; payment stays PENDING

    case "GATEWAY_FEE": {
      const feeAmt = round2(amount * 0.02);
      addSettlement(round2(amount - feeAmt), feeAmt, settleDays, 0);
      break;
    }

    case "AMOUNT_MISMATCH": {
      const delta = pickFrom([10, 25, 50, 100, 150, 250, 500]);
      const drifted =
        amount - delta > 0 && rand() < 0.5
          ? round2(amount - delta)
          : round2(amount + delta);
      addSettlement(drifted, 0, settleDays, 0);
      break;
    }

    case "SPLIT_SETTLEMENT": {
      const part1 = round2((amount * randInt(30, 70)) / 100);
      addSettlement(part1, 0, 1, 0);
      addSettlement(round2(amount - part1), 0, 2, 1);
      break;
    }

    case "REFUND":
    case "REFUND_REVERSAL": {
      addSettlement(amount, 0, settleDays, 0);
      refN += 1;
      const refundId = idOf("ref", refN);
      const refundedAt = paidAt + (settleDays + randInt(2, 7)) * DAY;
      refunds.push({
        id: refundId,
        paymentId,
        amount,
        timestamp: iso(refundedAt),
      });
      payment.status = "REFUNDED";
      refundedPaymentIds.add(paymentId);
      if (scenario === "REFUND_REVERSAL") {
        ledN += 1;
        ledger.push({
          id: idOf("led", ledN),
          referenceId: `${refundId}:REVERSAL`,
          debit: 0,
          credit: amount,
          timestamp: iso(refundedAt + randInt(1, 5) * DAY),
        });
        payment.status = "SETTLED"; // money returned after the refund
      }
      break;
    }

    default:
      addSettlement(amount, 0, settleDays, 0);
  }

  const meta = GT_META[scenario];
  const gtCase: GroundTruthCase = {
    caseId: `GT-${String(caseNo).padStart(3, "0")}`,
    orderId,
    paymentId,
    scenario,
    expectedDecision: meta.decision,
    expectedOutcome: meta.outcome,
    reviewRequired: meta.review,
    relatedOrderId,
    note:
      meta.note +
      (relatedOrderId ? ` Related order: ${relatedOrderId}.` : ""),
  };
  groundTruth.push(gtCase);
  gtByOrder.set(orderId, gtCase);
}

// ---------------------------------------------------------------------------
// Ledger assembly — exactly 100 lines (see header policy)
// ---------------------------------------------------------------------------
// 1 DEBIT per refund (25 lines)
for (const r of refunds) {
  ledN += 1;
  ledger.push({
    id: idOf("led", ledN),
    referenceId: r.id,
    debit: r.amount,
    credit: 0,
    timestamp: r.timestamp,
  });
}

// 1 CREDIT per settled non-refunded payment, split parts merged (71 lines)
for (const [pid, parts] of settlementsByPayment) {
  if (refundedPaymentIds.has(pid)) continue; // cash story told by refund lines
  ledN += 1;
  ledger.push({
    id: idOf("led", ledN),
    referenceId: pid,
    debit: 0,
    credit: round2(parts.reduce((sum, s) => sum + s.amount, 0)),
    timestamp: parts[parts.length - 1].settlementDate,
  });
}

// ---------------------------------------------------------------------------
// Invariant checks — fail loudly rather than emit broken fixtures
// ---------------------------------------------------------------------------
function expectInvariant(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Invariant failed: ${msg}`);
}

expectInvariant(orders.length === 100, `orders = ${orders.length}`);
expectInvariant(payments.length === 100, `payments = ${payments.length}`);
expectInvariant(settlements.length === 100, `settlements = ${settlements.length}`);
expectInvariant(refunds.length === 25, `refunds = ${refunds.length}`);
expectInvariant(ledger.length === 100, `ledger = ${ledger.length}`);
expectInvariant(
  groundTruth.length === 100,
  `ground-truth cases = ${groundTruth.length}`
);

const uniqIds = (rows: { id: string }[]): boolean =>
  new Set(rows.map((r) => r.id)).size === rows.length;
expectInvariant(uniqIds(orders), "unique order ids");
expectInvariant(uniqIds(payments), "unique payment ids");
expectInvariant(uniqIds(settlements), "unique settlement ids");
expectInvariant(uniqIds(refunds), "unique refund ids");
expectInvariant(uniqIds(ledger), "unique ledger ids");

for (const [pid, parts] of settlementsByPayment) {
  const p = paymentsById.get(pid);
  expectInvariant(p !== undefined, `settlements reference known payment ${pid}`);
  const scenarioOfPid = groundTruth.find((c) => c.paymentId === pid)?.scenario;
  for (const s of parts) {
    expectInvariant(s.amount > 0, `positive settlement ${s.id}`);
    if (scenarioOfPid === "AMOUNT_MISMATCH") {
      // deliberate drift, bounded by the ±500 delta pool
      expectInvariant(
        Math.abs(s.amount - p!.amount) <= 500,
        `bounded mismatch settlement ${s.id}`
      );
    } else {
      expectInvariant(
        s.amount <= p!.amount,
        `settlement ${s.id} within payment amount`
      );
    }
  }
  if (parts.length > 1) {
    expectInvariant(
      round2(parts.reduce((sum, s) => sum + s.amount, 0)) === p!.amount,
      `split settlements of ${pid} sum exactly to the payment`
    );
  }
}
for (const r of refunds) {
  const p = paymentsById.get(r.paymentId);
  expectInvariant(p !== undefined, `refund ${r.id} references known payment`);
  expectInvariant(r.amount > 0 && r.amount <= p!.amount, `sane refund ${r.id}`);
}

// ---------------------------------------------------------------------------
// Emit JSON fixtures
// ---------------------------------------------------------------------------
const DATA_DIR = path.resolve(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

function writeJson(name: string, payload: unknown): void {
  fs.writeFileSync(
    path.join(DATA_DIR, name),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

writeJson("orders.json", orders);
writeJson("payments.json", payments);
writeJson("settlements.json", settlements);
writeJson("refunds.json", refunds);
writeJson("ledger.json", ledger);
writeJson("ground-truth.json", groundTruth);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`ADAPT synthetic data generated (seed ${SEED}) -> ${DATA_DIR}`);
console.log(
  [
    `orders:       ${orders.length}`,
    `payments:     ${payments.length}`,
    `settlements:  ${settlements.length}`,
    `refunds:      ${refunds.length}`,
    `ledger:       ${ledger.length}`,
    `ground-truth: ${groundTruth.length} cases`,
  ].join("\n")
);

const tally: Record<string, number> = {};
for (const c of groundTruth) {
  tally[c.scenario] = (tally[c.scenario] ?? 0) + 1;
}
console.log(`Scenarios: ${JSON.stringify(tally)}`);
