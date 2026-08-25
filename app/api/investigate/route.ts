/**
 * POST /api/investigate — Run bounded investigation on a transaction.
 * Uses existing data only. Never modifies financial records.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FinancialDataBundle } from "../../../lib/types";
import { reconcile } from "../../../lib/reconciliation";
import { investigate } from "../../../lib/investigation/agent";

async function loadBundle(): Promise<FinancialDataBundle> {
  const load = async (name: string): Promise<unknown[]> => {
    const raw = await readFile(path.join(process.cwd(), "data", name), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`${name}: expected an array`);
    return parsed;
  };
  const [orders, payments, settlements, refunds, ledger] = await Promise.all([
    load("orders.json"), load("payments.json"), load("settlements.json"),
    load("refunds.json"), load("ledger.json"),
  ]);
  return { orders, payments, settlements, refunds, ledger } as FinancialDataBundle;
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Malformed JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Body must be a JSON object." }, { status: 400 });
  }

  const transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : "";
  if (!transactionId) {
    return Response.json({ error: "transactionId is required." }, { status: 400 });
  }

  try {
    const data = await loadBundle();
    const report = reconcile(data);
    const decision = report.decisions.find((d) => d.transactionId === transactionId);

    if (!decision) {
      return Response.json({ error: `Transaction ${transactionId} not found.` }, { status: 404 });
    }

    const result = investigate(transactionId, data, decision);
    return Response.json(result);
  } catch (error) {
    console.error("[INVESTIGATE ERROR]", error instanceof Error ? error.message : error);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}
