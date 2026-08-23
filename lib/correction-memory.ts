/**
 * ADAPT — correction memory.
 *
 * Deterministic recall of past human corrections. Simple structured matching
 * only — no embeddings, no vector database, nothing invented:
 *
 *   same transaction (payment) id   -> +0.60  strongest signal
 *   same correctionType             -> +0.25  same mistake category
 *   same correctedDecision target   -> +0.10  same remediation direction
 *   same originalDecision           -> +0.05  same starting point
 *
 * A score > 0 means "relevant"; ties break deterministically by id.
 */
import { PrismaClient, type Correction } from "@prisma/client";

/**
 * Lazy singleton so importing this module never opens a connection and tests
 * can point DATABASE_URL at a throwaway database before the first query.
 */
let client: PrismaClient | null = null;

export function getDb(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}

/** What the caller knows about the case that needs memory. All fields optional. */
export interface MemoryQuery {
  transactionId?: string;
  correctionType?: string;
  correctedDecision?: string;
  originalDecision?: string;
  limit?: number;
}

export interface ScoredCorrection {
  correction: Correction;
  /** Relevance score; strictly greater than 0 means relevant. */
  score: number;
  /** Payment id of the corrected decision, when known. */
  transactionId: string | null;
}

/** Structured relevance score for one stored correction. 0 => not relevant. */
export function scoreCorrection(
  correction: Correction,
  transactionId: string | null,
  query: MemoryQuery
): number {
  let score = 0;
  if (
    query.transactionId &&
    transactionId &&
    query.transactionId === transactionId
  ) {
    score += 0.6;
  }
  if (
    query.correctionType &&
    query.correctionType === correction.correctionType
  ) {
    score += 0.25;
  }
  if (
    query.correctedDecision &&
    query.correctedDecision === correction.correctedDecision
  ) {
    score += 0.1;
  }
  if (
    query.originalDecision &&
    query.originalDecision === correction.originalDecision
  ) {
    score += 0.05;
  }
  return Math.min(score, 1);
}

/**
 * Recent corrections ranked by structured relevance to the query.
 * Returns an empty list when memory is empty or nothing matches.
 */
export async function findRelevantCorrections(
  query: MemoryQuery,
  scanLimit = 200
): Promise<ScoredCorrection[]> {
  const db = getDb();
  const rows = await db.correction.findMany({
    orderBy: { createdAt: "desc" },
    take: scanLimit,
    include: { decision: true },
  });

  const scored: ScoredCorrection[] = [];
  for (const row of rows) {
    const txId = row.decision?.transactionId ?? null;
    const score = scoreCorrection(row, txId, query);
    if (score > 0) {
      scored.push({ correction: row, score, transactionId: txId });
    }
  }

  scored.sort((a, b) =>
    b.score - a.score || (a.correction.id < b.correction.id ? -1 : 1)
  );

  return scored.slice(0, Math.max(1, query.limit ?? 5));
}
