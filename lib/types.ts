/**
 * ADAPT — shared domain types for the deterministic reconciliation engine.
 * Record shapes mirror prisma/schema.prisma and the data/*.json fixtures.
 */

// ---------------------------------------------------------------------------
// Raw financial records
// ---------------------------------------------------------------------------
export interface Order {
  id: string;
  customerId: string;
  amount: number;
  currency: string;
  createdAt: string; // ISO-8601
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  status: string; // SETTLED | PENDING | REFUNDED
  timestamp: string; // ISO-8601
}

export interface Settlement {
  id: string;
  paymentId: string;
  amount: number;
  fee: number;
  settlementDate: string; // ISO-8601
}

export interface Refund {
  id: string;
  paymentId: string;
  amount: number;
  timestamp: string; // ISO-8601
}

export interface LedgerEntry {
  id: string;
  referenceId: string; // payment/refund id, or "<refundId>:REVERSAL"
  debit: number;
  credit: number;
  timestamp: string; // ISO-8601
}

/** Everything the engine needs, in memory. */
export interface FinancialDataBundle {
  orders: Order[];
  payments: Payment[];
  settlements: Settlement[];
  refunds: Refund[];
  ledger: LedgerEntry[];
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/** Outcome of judging one payment. REVIEW never auto-approves anything. */
export type ReconciliationDecision =
  | "MATCHED"
  | "REVIEW"
  | "MISMATCH"
  | "MISSING"
  | "REFUNDED";

/** Where a decision came from. The deterministic engine only emits DETERMINISTIC. */
export type DecisionSource = "DETERMINISTIC" | "OLLAMA" | "HUMAN_REVIEW";

/** One machine-checkable fact supporting a decision. */
export interface EvidenceItem {
  field: string;
  expected: number | string | null;
  actual: number | string | null;
  detail?: string;
}

/** Structured result for one judged transaction (always keyed by payment id). */
export interface DecisionResult {
  transactionId: string;
  decision: ReconciliationDecision;
  /** Certainty of THIS decision value, between 0 and 1 inclusive. */
  confidence: number;
  reason: string;
  evidence: EvidenceItem[];
  /** Counterpart record(s) examined, when any exist ("stl_a+stl_b" for splits). */
  matchedRecordId: string | null;
  source: DecisionSource;
  /**
   * Per-transaction AI investigation status.
   *
   * AI_SUCCESS   — sent to Ollama and received a valid verdict.
   * AI_FALLBACK  — sent to AI but output failed; safe REVIEW fallback used.
   * AI_SKIPPED   — intentionally not escalated by the escalation policy.
   * AI_NOT_REQUESTED — reconciliation run had AI disabled.
   */
  aiStatus?:
    | "AI_SUCCESS"
    | "AI_FALLBACK"
    | "AI_SKIPPED"
    | "AI_NOT_REQUESTED";
  /** ML-assisted risk prioritization. Only present for non-MATCHED decisions. */
  risk?: {
    score: number;
    level: "LOW" | "MEDIUM" | "HIGH";
    signals: string[];
  };
  /** Anomaly & pattern intelligence. Only present for non-MATCHED decisions. */
  anomaly?: {
    isAnomalous: boolean;
    anomalyScore: number;
    severity: "LOW" | "MEDIUM" | "HIGH" | null;
    signals: Array<{
      type: string;
      severity: "LOW" | "MEDIUM" | "HIGH";
      title: string;
      explanation: string;
      evidence: string[];
    }>;
  };
  /** Resolution recommendation. Only present for non-MATCHED decisions. */
  resolution?: {
    priority: "LOW" | "MEDIUM" | "HIGH";
    action: string;
    title: string;
    rationale: string;
    steps: Array<{ order: number; action: string }>;
    supportingSignals: string[];
  };
}

// ---------------------------------------------------------------------------
// Pipeline types
// ---------------------------------------------------------------------------

/** Prebuilt indexes so per-payment judging stays cheap and pure. */
export interface ReconciliationContext {
  ordersById: Map<string, Order>;
  settlementsByPayment: Map<string, Settlement[]>;
  refundsByPayment: Map<string, Refund[]>;
  /** refundId -> total credited reversal amount found in the ledger. */
  reversalCreditsByRefund: Map<string, number>;
  payments: Payment[];
  orders: Order[];
}

export interface ReconciliationSummary {
  total: number;
  byDecision: Record<ReconciliationDecision, number>;
}

export interface ReconciliationReport {
  decisions: DecisionResult[]; // sorted by transactionId for stability
  summary: ReconciliationSummary;
}
