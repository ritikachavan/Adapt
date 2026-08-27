/**
 * ADAPT — Grok Challenge Analyst Provider.
 * Implements AiJudgeProvider using xAI's Grok API.
 * Role: independent challenger searching for contradictory evidence.
 * Server-side only. API key never exposed to browser.
 */
import type { AiJudgeProvider, JudgeCandidateContext } from "./provider";
import { createSafeFallback } from "./provider";
import type { DecisionResult, EvidenceItem, ReconciliationDecision } from "../types";

const VALID_DECISIONS: readonly ReconciliationDecision[] = [
  "MATCHED", "REVIEW", "MISMATCH", "MISSING", "REFUNDED",
];

export interface GrokProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface RawVerdict {
  decision: ReconciliationDecision;
  confidence: number;
  matchedRecordId: string | null;
  reason: string;
  evidence: DecisionResult["evidence"];
}

class InvalidVerdictError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidVerdictError"; }
}

function buildChallengePrompt(context: JudgeCandidateContext): string {
  const payment = context.paymentSummary;
  const settlements = context.candidateSettlements;
  const refunds = context.refunds;
  const ledger = context.ledgerEvidence;
  const candidateCount = settlements.length;

  const valueLines: string[] = [];
  valueLines.push(`AUTHORITATIVE TRANSACTION ${payment.id}:`);
  valueLines.push(`  Amount: ${payment.amount}`);
  valueLines.push(`  Status: ${payment.status}`);
  if (payment.orderId) valueLines.push(`  OrderId: ${payment.orderId}`);
  valueLines.push("");

  if (settlements.length > 0) {
    valueLines.push(`AUTHORITATIVE SETTLEMENT CANDIDATES (${candidateCount}):`);
    for (const s of settlements) {
      valueLines.push(`  ${s.id}: paymentId=${s.paymentId}, amount=${s.amount}, fee=${s.fee}, date=${s.settlementDate}`);
    }
    valueLines.push("");
  }

  if (refunds.length > 0) {
    valueLines.push("REFUNDS:");
    for (const r of refunds) {
      valueLines.push(`  ${r.id}: paymentId=${r.paymentId}, amount=${r.amount}, date=${r.timestamp}`);
    }
    valueLines.push("");
  }

  if (ledger.length > 0) {
    valueLines.push("LEDGER:");
    for (const l of ledger) {
      valueLines.push(`  ${l.id}: referenceId=${l.referenceId}, debit=${l.debit}, credit=${l.credit}`);
    }
    valueLines.push("");
  }

  const detEvidence = context.deterministicEvidence;
  if (detEvidence.length > 0) {
    valueLines.push("DETERMINISTIC ESCALATION REASON (context only — not an automatic decision):");
    for (const e of detEvidence) {
      valueLines.push(`  - ${e.field}: ${e.detail}`);
    }
    valueLines.push("");
  }

  return [
    `Challenge Analyst for ${payment.id}. Independent analysis — you do NOT see the other analyst.`,
    "Do not invent IDs or amounts. Identify which record supports your conclusion.",
    "",
    "SOURCE RECORDS:",
    valueLines.join("\n"),
    `VALID IDS: [${context.candidateRecordIds.join(", ")}]`,
    "",
    "RULES: 1 candidate with matching paymentId+amount=MATCHED. 0 candidates=MISSING. Refund=REFUNDED. Ambiguous=REVIEW. Amount differs=MISMATCH.",
    "REVIEW flag = needs investigation, NOT that the answer is REVIEW.",
    "",
    "Return ONLY JSON: {\"decision\":\"...\",\"confidence\":0.0-1.0,\"matchedRecordId\":\"stl_xxx|null\",\"reason\":\"<10 words\",\"evidence\":[{\"field\":\"...\",\"sourceRecordId\":\"stl_xxx\",\"detail\":\"...\"}]}",
  ].join("\n");
}

/**
 * Extract JSON from a response that may contain markdown code fences
 * or reasoning text before/after the JSON object.
 */
function extractJsonFromResponse(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (braceMatch) return braceMatch[1].trim();
  return trimmed;
}

function parseAndValidateVerdict(raw: string, candidateRecordIds: string[]): RawVerdict {
  const jsonStr = extractJsonFromResponse(raw);
  let parsed: unknown;
  try { parsed = JSON.parse(jsonStr); } catch { throw new InvalidVerdictError(`Response is not valid JSON: ${jsonStr.substring(0, 200)}`); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new InvalidVerdictError("Response is not an object");
  const v = parsed as Record<string, unknown>;
  if (typeof v.decision !== "string" || !VALID_DECISIONS.includes(v.decision as ReconciliationDecision)) throw new InvalidVerdictError(`Invalid decision: ${String(v.decision)}`);
  if (typeof v.confidence !== "number" || !Number.isFinite(v.confidence) || v.confidence < 0 || v.confidence > 1) throw new InvalidVerdictError("Confidence must be 0-1");
  if (v.matchedRecordId !== null && typeof v.matchedRecordId !== "string") throw new InvalidVerdictError("matchedRecordId must be string or null");
  if (typeof v.reason !== "string" || v.reason.trim() === "") throw new InvalidVerdictError("Missing reason");
  if (!Array.isArray(v.evidence)) throw new InvalidVerdictError("Evidence must be an array");
  if (v.matchedRecordId !== null && !candidateRecordIds.includes(v.matchedRecordId as string)) throw new InvalidVerdictError(`Hallucinated matchedRecordId: ${v.matchedRecordId}`);
  // Validate and filter evidence items — reject empty objects and items missing required `field`
  const rawEvidence = v.evidence as unknown[];
  const validEvidence: DecisionResult["evidence"] = [];
  for (const item of rawEvidence) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      console.error(`[GROQ PARSE] Rejected non-object evidence item: ${JSON.stringify(item)}`);
      continue;
    }
    const e = item as Record<string, unknown>;
    if (typeof e.field !== "string" || e.field.trim() === "") {
      console.error(`[GROQ PARSE] Rejected evidence item missing 'field': ${JSON.stringify(e)}`);
      continue;
    }
    // Accept the item — field is present. Other properties (sourceRecordId, detail, actual, expected)
    // are optional at parse time; resolveEvidenceFromSources handles them.
    validEvidence.push(e as unknown as EvidenceItem);
  }
  return { decision: v.decision as ReconciliationDecision, confidence: v.confidence as number, matchedRecordId: v.matchedRecordId as string | null, reason: v.reason as string, evidence: validEvidence };
}

/**
 * Resolve Groq's evidence from sourceRecordId references to actual numeric values.
 * Groq identifies which source record supports its claim; this function resolves
 * the authoritative numeric values from the actual transaction/settlement records.
 * Never trusts LLM-generated numeric values.
 */
function resolveEvidenceFromSources(
  rawEvidence: Array<Record<string, unknown>>,
  context: JudgeCandidateContext
): DecisionResult["evidence"] {
  const payment = context.paymentSummary;
  const settlements = context.candidateSettlements;
  const refunds = context.refunds;

  return rawEvidence.map((item) => {
    const field = typeof item.field === "string" ? item.field : "unknown";
    const detail = typeof item.detail === "string" ? item.detail : undefined;
    const sourceRecordId = typeof item.sourceRecordId === "string" ? item.sourceRecordId : null;

    let expected: string | number | null = null;
    let actual: string | number | null = null;

    // Resolve from authoritative source records
    if (sourceRecordId) {
      // Check settlements
      const stl = settlements.find((s) => String(s.id) === sourceRecordId);
      if (stl) {
        if (field === "settlement.total" || field === "amount") {
          actual = typeof stl.amount === "number" ? stl.amount : null;
          expected = typeof payment.amount === "number" ? payment.amount : null;
        } else if (field === "settlement.fee") {
          actual = typeof stl.fee === "number" ? stl.fee : null;
        }
      }

      // Check payment
      if (String(payment.id) === sourceRecordId) {
        if (field === "payment.amount" || field === "amount") {
          actual = typeof payment.amount === "number" ? payment.amount : null;
        }
      }

      // Check refunds
      const ref = refunds.find((r) => String(r.id) === sourceRecordId);
      if (ref) {
        if (field === "refund.amount") {
          actual = typeof ref.amount === "number" ? ref.amount : null;
        }
      }
    }

    // NEVER trust LLM-generated numeric values — always resolve from source or null
    // If no sourceRecordId was provided, actual remains null
    if (actual === null && typeof item.actual === "number") {
      console.error(`[GROQ EVIDENCE] Discarded LLM-generated actual=${item.actual} for field=${field} (no valid sourceRecordId)`);
    }
    return { field, expected, actual, ...(detail ? { detail } : {}) };
  });
}

export function createGrokJudgeProvider(options: GrokProviderOptions): AiJudgeProvider {
  const { apiKey, model = "llama-3.3-70b-versatile", baseUrl = "https://api.groq.com/openai/v1", timeoutMs = 30_000, fetchImpl } = options;
  if (!apiKey || apiKey.trim() === "") {
    return { name: "groq:unavailable", async judge(ctx) { return createSafeFallback(ctx.paymentId); } };
  }
  const doFetch = fetchImpl ?? fetch;
  const cleanBase = baseUrl.replace(/\/+$/, "");

  async function generate(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestBody = {
        model,
        messages: [
          { role: "system", content: "You are a financial reconciliation Challenge Analyst. Return ONLY valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        max_tokens: 4096,
        response_format: { type: "json_object" },
      };

      console.error("[GROQ DEBUG] Request:", JSON.stringify({ model, baseUrl: cleanBase, max_tokens: requestBody.max_tokens }));

      const response = await doFetch(`${cleanBase}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      } as RequestInit);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "unable to read error body");
        throw new Error(`Grok HTTP ${response.status}: ${errorBody.substring(0, 200)}`);
      }

      const body = await response.json() as {
        choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      console.error("[GROQ DEBUG] Response:", JSON.stringify({
        hasChoices: !!body.choices?.length,
        hasContent: typeof body.choices?.[0]?.message?.content === "string" && body.choices[0].message.content.length > 0,
        contentLength: body.choices?.[0]?.message?.content?.length ?? 0,
        hasReasoning: typeof (body.choices?.[0]?.message as Record<string, unknown>)?.reasoning === "string",
        usage: body.usage,
      }));

      const message = body?.choices?.[0]?.message;
      if (!message) throw new Error("Grok returned no message in choices");

      const content = message.content;
      const reasoning = (message as Record<string, unknown>).reasoning as string | undefined;

      if (typeof content === "string" && content.trim() !== "") {
        return content;
      }

      // Reasoning models may return JSON in the reasoning field when content is empty
      if (typeof reasoning === "string" && reasoning.trim() !== "") {
        console.error("[GROQ DEBUG] Content empty, extracting from reasoning field");
        const jsonMatch = reasoning.match(/\{[\s\S]*"decision"[\s\S]*\}/);
        if (jsonMatch) return jsonMatch[0];
      }

      throw new Error("Grok returned empty content");
    } finally { clearTimeout(timer); }
  }

  return {
    name: `groq:${model}`,
    async judge(context: JudgeCandidateContext): Promise<DecisionResult> {
      const start = Date.now();
      console.error(`[GROQ] transaction=${context.paymentId} started model=${model}`);
      try {
        const prompt = buildChallengePrompt(context);
        const raw = await generate(prompt);
        const verdict = parseAndValidateVerdict(raw, context.candidateRecordIds);
        console.error("[GROQ VERDICT]", JSON.stringify({ transactionId: context.paymentId, decision: verdict.decision, matchedRecordId: verdict.matchedRecordId, evidenceCount: verdict.evidence.length, evidence: (verdict.evidence as unknown as Array<Record<string, unknown>>).map((e) => ({ field: e.field, sourceRecordId: e.sourceRecordId, actual: e.actual })) }));
        // Resolve evidence from authoritative source records — never trust LLM numeric values
        const resolvedEvidence = resolveEvidenceFromSources(
          verdict.evidence as unknown as Array<Record<string, unknown>>,
          context
        );
        const elapsed = Date.now() - start;
        console.error("[GROQ RESOLVED]", JSON.stringify({ transactionId: context.paymentId, elapsedMs: elapsed, resolved: resolvedEvidence.map((e) => ({ field: e.field, expected: e.expected, actual: e.actual })) }));
        console.error(`[GROQ] transaction=${context.paymentId} completed in ${elapsed}ms decision=${verdict.decision} confidence=${verdict.confidence}`);
        return { transactionId: context.paymentId, decision: verdict.decision, confidence: verdict.confidence, reason: verdict.reason, evidence: resolvedEvidence, matchedRecordId: verdict.matchedRecordId, source: "GROQ" };
      } catch (error) {
        const elapsed = Date.now() - start;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[GROQ JUDGE ERROR]", JSON.stringify({ transactionId: context.paymentId, model, elapsedMs: elapsed, errorMessage: errorMessage.substring(0, 300) }));
        return createSafeFallback(context.paymentId, "GROQ");
      }
    },
  };
}
