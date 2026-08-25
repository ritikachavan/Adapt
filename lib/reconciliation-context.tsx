"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { TransactionRow } from "@/components/dashboard/TransactionTable";

interface AiMetrics {
  deterministicReviewCount: number;
  aiEscalatedCount: number;
  aiSuccessCount: number;
  aiFallbackCount: number;
  aiSkippedCount: number;
  aiEnabled: boolean;
  aiProvider: string | null;
}

export interface ReconciliationResult {
  decisions: TransactionRow[];
  summary: { total: number; matched: number; reviewed: number; mismatched: number; missing: number; refunded: number };
  aiMetrics: AiMetrics;
}

type Status = "IDLE" | "LOADING" | "HAS_RESULT" | "ERROR";

interface ReconciliationState {
  data: ReconciliationResult | null;
  status: Status;
  aiMode: boolean;
  error: string | null;
  setData: (data: ReconciliationResult | null) => void;
  setStatus: (s: Status) => void;
  setAiMode: (m: boolean) => void;
  setError: (e: string | null) => void;
}

const ReconciliationContext = createContext<ReconciliationState | null>(null);

export function ReconciliationProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ReconciliationResult | null>(null);
  const [status, setStatus] = useState<Status>("IDLE");
  const [aiMode, setAiMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableSetData = useCallback(setData, []);
  const stableSetStatus = useCallback(setStatus, []);
  const stableSetAiMode = useCallback(setAiMode, []);
  const stableSetError = useCallback(setError, []);

  const value = useMemo<ReconciliationState>(
    () => ({ data, status, aiMode, error, setData: stableSetData, setStatus: stableSetStatus, setAiMode: stableSetAiMode, setError: stableSetError }),
    [data, status, aiMode, error, stableSetData, stableSetStatus, stableSetAiMode, stableSetError]
  );

  return <ReconciliationContext.Provider value={value}>{children}</ReconciliationContext.Provider>;
}

export function useReconciliation() {
  const ctx = useContext(ReconciliationContext);
  if (!ctx) throw new Error("useReconciliation must be used within ReconciliationProvider");
  return ctx;
}
