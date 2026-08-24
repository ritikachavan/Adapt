// Integration tests for the Decision Replay endpoint (GET /api/audit).
// Uses a throwaway copy of the migrated SQLite database; Ollama never runs.
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as auditGet } from "../app/api/audit/route";
import { POST as correctPost } from "../app/api/correct/route";
import { getDb } from "../lib/correction-memory";

const TEST_DB_PATH = path.join("prisma", "test-audit-copy.sqlite");

function ensureTemplateDatabase(): void {
  if (!existsSync(path.resolve("prisma/dev.db"))) {
    execSync("npx prisma db push --skip-generate", { stdio: "ignore" });
  }
}

beforeAll(() => {
  ensureTemplateDatabase();
  const absolute = path.resolve(TEST_DB_PATH).replace(/\\/g, "/");
  process.env.DATABASE_URL = `file:${absolute}`;
  copyFileSync(path.resolve("prisma/dev.db"), path.resolve(TEST_DB_PATH));
  // Start from clean decision/correction tables for predictable assertions.
});

afterAll(async () => {
  await getDb().$disconnect();
  rmSync(path.resolve(TEST_DB_PATH), { force: true });
});

function replayUrl(transactionId: string): string {
  return `http://localhost/api/audit?transactionId=${encodeURIComponent(transactionId)}`;
}

describe("GET /api/audit (decision replay)", () => {
  it("loads a real transaction with complete financial records", async () => {
    const res = await auditGet(new Request(replayUrl("pay_0001")));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      found: boolean;
      records: {
        order: { id: string } | null;
        payment: { id: string } | null;
        settlements: Array<{ id: string; amount: number }>;
        refunds: Array<unknown>;
        ledger: Array<unknown>;
      };
      deterministic: { present: boolean; decision: string };
    };
    expect(body.found).toBe(true);
    expect(body.records.payment?.id).toBe("pay_0001");
    expect(body.records.order?.id).toBe("ord_0001");
    expect(Array.isArray(body.records.settlements)).toBe(true);
    expect(body.deterministic.present).toBe(true);
    expect(typeof body.deterministic.decision).toBe("string");
  });

  it("shows deterministic decision, confidence, reason and evidence", async () => {
    const res = await auditGet(new Request(replayUrl("pay_0001")));
    const body = (await res.json()) as {
      deterministic: {
        decision: string;
        confidence: number;
        reason: string;
        evidence: Array<{ field: string }>;
        source: string;
      };
    };
    expect(body.deterministic.confidence).toBeGreaterThanOrEqual(0);
    expect(body.deterministic.confidence).toBeLessThanOrEqual(1);
    expect(body.deterministic.reason.length).toBeGreaterThan(0);
    expect(body.deterministic.evidence.length).toBeGreaterThan(0);
    expect(body.deterministic.source).toBe("DETERMINISTIC");
  });
  it("does not fabricate an AI stage when none was invoked", async () => {
    const res = await auditGet(new Request(replayUrl("pay_0001")));
    const body = (await res.json()) as {
      ai: { invoked: boolean; status: string };
    };
    expect(body.ai.invoked).toBe(false);
    expect(body.ai.status).toBe("NOT_INVOKED");
  });

  it("returns a safe 404 error for a missing transaction", async () => {
    const res = await auditGet(new Request(replayUrl("pay_does_not_exist")));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("not found");
  });

  it("surfaces correction information once a human corrects the case", async () => {
    const seed = await correctPost(
      new Request("http://localhost/api/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionId: "pay_0001",
          correctedDecision: "MISMATCH",
          correctionType: "WRONG_MATCH",
          explanation: "Judge replay seeding: settlement is clearly short.",
        }),
      })
    );
    expect(seed.status).toBe(201);

    const res = await auditGet(new Request(replayUrl("pay_0001")));
    const body = (await res.json()) as {
      humanReview: {
        present: boolean;
        corrections: Array<{
          correctedDecision: string;
          correctionType: string;
          explanation: string;
        }>;
      };
      memory: { items: Array<{ correctionType: string }> };
    };
    expect(body.humanReview.present).toBe(true);
    expect(body.humanReview.corrections.length).toBeGreaterThan(0);
    expect(body.humanReview.corrections[0].correctedDecision).toBe("MISMATCH");
    expect(
      body.memory.items.some((m) => m.correctionType === "WRONG_MATCH")
    ).toBe(true);
  });
/* @@AR2@@ */
});