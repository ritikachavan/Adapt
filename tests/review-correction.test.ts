/**
 * Integration tests for human review + correction memory.
 * Uses a throwaway COPY of the migrated SQLite database: neither dev.db data
 * nor a running Ollama server are required.
 */
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../lib/correction-memory";
import { GET as reviewGet } from "../app/api/review/route";
import { POST as correctPost } from "../app/api/correct/route";
import { GET as memoryGet } from "../app/api/memory/route";

const TEST_DB_PATH = path.join("prisma", "test-review-copy.sqlite");

/** Guarantee a migrated template database exists to copy. */
function ensureTemplateDatabase(): void {
  if (!existsSync(path.resolve("prisma/dev.db"))) {
    // Fresh checkout fallback: materialise the schema once via Prisma CLI
    // (the CLI loads DATABASE_URL from .env itself).
    execSync("npx prisma db push --skip-generate", { stdio: "ignore" });
  }
}

beforeAll(() => {
  ensureTemplateDatabase();
  // Absolute path with forward slashes: runtime Prisma resolves RELATIVE
  // sqlite urls against the process CWD (not prisma/), which silently opens
  // an empty database. Absolute avoids that entirely.
  const absolute = path.resolve(TEST_DB_PATH).replace(/\\/g, "/");
  process.env.DATABASE_URL = `file:${absolute}`;
  copyFileSync(path.resolve("prisma/dev.db"), path.resolve(TEST_DB_PATH));
});

afterAll(async () => {
  await getDb().$disconnect();
  rmSync(path.resolve(TEST_DB_PATH), { force: true });
  rmSync(path.resolve("test-review-copy.db"), { force: true }); // stale-artifact guard
});

const REVIEW_URL = "http://localhost/api/review";
const CORRECT_URL = "http://localhost/api/correct";

async function postCorrection(body: unknown): Promise<Response> {
  return correctPost(
    new Request(CORRECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

describe("human review + correction memory", () => {
  it("review endpoint returns only REVIEW cases with required fields", async () => {
    const res = await reviewGet(new Request(REVIEW_URL));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      cases: Array<
        Record<string, unknown> & { decision: string; confidence: number }
      >;
    };
    expect(body.count).toBeGreaterThan(0);
    expect(body.cases).toHaveLength(body.count);
    for (const c of body.cases) {
      expect(c.decision).toBe("REVIEW");
      expect(typeof c.transactionId).toBe("string");
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(c.evidence)).toBe(true);
      expect("matchedRecordId" in c).toBe(true);
      expect("reason" in c).toBe(true);
    }
  });

  it("rejects invalid correction payloads", async () => {
    expect((await postCorrection({})).status).toBe(400);
    expect(
      (
        await postCorrection({
          decisionId: "pay_1",
          correctedDecision: "APPROVED",
          correctionType: "X",
          explanation: "y",
        })
      ).status
    ).toBe(400);
    expect(
      (
        await postCorrection({
          decisionId: "pay_1",
          correctedDecision: "MISMATCH",
          correctionType: "X",
          explanation: "",
        })
      ).status
    ).toBe(400);
  });
  it("persists a correction and materialises its decision exactly once", async () => {
    const queueRes = await reviewGet(new Request(REVIEW_URL));
    const queue = (await queueRes.json()) as {
      cases: Array<{ transactionId: string }>;
    };
    const target = queue.cases[0].transactionId;

    const res1 = await postCorrection({
      decisionId: target,
      correctedDecision: "MISMATCH",
      correctionType: "WRONG_MATCH",
      explanation: "Settlement total clearly short; not a clean match.",
    });
    expect(res1.status).toBe(201);
    const saved = (
      (await res1.json()) as {
        correction: {
          id: string;
          decisionId: string;
          originalDecision: string;
          correctedDecision: string;
        };
      }
    ).correction;
    expect(saved.originalDecision).toBe("REVIEW");
    expect(saved.correctedDecision).toBe("MISMATCH");

    const db = getDb();
    const rows = await db.reconciliationDecision.findMany({
      where: { transactionId: target },
    });
    expect(rows).toHaveLength(1);
    // The stored row reflects the AI-escalation stage's verdict for this
    // transaction (safe fallback when Ollama is absent), hence source OLLAMA.
    expect(rows[0].source).toBe("FALLBACK");
    expect(saved.decisionId).toBe(rows[0].id);

    // Correcting the same transaction again reuses the same decision row.
    const res2 = await postCorrection({
      decisionId: target,
      correctedDecision: "MISSING",
      correctionType: "SECOND_LOOK",
      explanation: "Re-checked after new evidence.",
    });
    expect(res2.status).toBe(201);
    const stillOne = await db.reconciliationDecision.findMany({
      where: { transactionId: target },
    });
    expect(stillOne).toHaveLength(1);
  });

  it("memory returns relevant corrections for a matching correctionType", async () => {
    const res = await memoryGet(
      new Request("http://localhost/api/memory?correctionType=WRONG_MATCH")
    );
    const body = (await res.json()) as {
      count: number;
      corrections: Array<{
        correctionType: string;
        transactionId: string | null;
        score: number;
      }>;
    };
    expect(res.status).toBe(200);
    expect(body.count).toBeGreaterThan(0);
    for (const m of body.corrections) {
      expect(m.correctionType).toBe("WRONG_MATCH");
      expect(typeof m.transactionId).toBe("string");
      expect(m.score).toBeGreaterThan(0);
    }
  });

  it("does not return unrelated corrections", async () => {
    const res = await memoryGet(
      new Request(
        "http://localhost/api/memory?transactionId=pay_9999&correctionType=TOTALLY_UNRELATED"
      )
    );
    const body = (await res.json()) as {
      count: number;
      corrections: unknown[];
    };
    expect(body.count).toBe(0);
    expect(body.corrections).toEqual([]);
  });

  it("handles empty memory safely", async () => {
    const db = getDb();
    await db.correction.deleteMany({});
    await db.reconciliationDecision.deleteMany({});
    const res = await memoryGet(
      new Request("http://localhost/api/memory?correctionType=ANY")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      corrections: unknown[];
    };
    expect(body.count).toBe(0);
    expect(body.corrections).toEqual([]);
  });
});