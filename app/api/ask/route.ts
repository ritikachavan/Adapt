/**
 * POST /api/ask — Ask Adapt financial investigation copilot.
 *
 * Accepts a natural-language question, retrieves relevant financial context
 * deterministically, sends a grounded prompt to the existing Ollama provider,
 * and returns a validated answer with evidence.
 *
 * NEVER invents financial facts. If the data is insufficient, says so explicitly.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  DecisionResult,
  FinancialDataBundle,
} from "../../../lib/types";

import { reconcile } from "../../../lib/reconciliation";
import { createOllamaJudgeProvider } from "../../../lib/ai/ollama";
import { scoreDecision } from "../../../lib/risk/riskScoring";
import { analyzeDecision } from "../../../lib/risk/anomalyDetection";
import { recommendResolution } from "../../../lib/resolution/resolutionRecommendations";

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

type QuestionType = "TRANSACTION" | "RISK" | "ANOMALY" | "RECONCILIATION" | "MONEY_FLOW" | "GENERAL";

function classifyQuestion(question: string): { type: QuestionType; transactionId: string | null } {
  const q = question.toLowerCase();
  const txnMatch = q.match(/\b(pay_\d+|pay_[a-z0-9_]+)\b/i);
  const transactionId = txnMatch ? txnMatch[1].toLowerCase() : null;

  if (q.includes("where") && (q.includes("money") || q.includes("go") || q.includes("went")))
    return { type: "MONEY_FLOW", transactionId };
  if (q.includes("risk") || q.includes("highest") || q.includes("investigate first"))
    return { type: "RISK", transactionId };
  if (q.includes("anomal") || q.includes("variance") || q.includes("unusual") || q.includes("largest"))
    return { type: "ANOMALY", transactionId };
  if (q.includes("health") || q.includes("reconcil") || q.includes("match rate"))
    return { type: "RECONCILIATION", transactionId };
  if (q.includes("why") && q.includes("review"))
    return { type: "TRANSACTION", transactionId };
  if (transactionId) return { type: "TRANSACTION", transactionId };
  return { type: "GENERAL", transactionId: null };
}

function retrieveTransactionContext(data: FinancialDataBundle, decisions: DecisionResult[], tid: string) {
  const payment = data.payments.find((p) => p.id === tid) ?? null;
  const order = payment ? data.orders.find((o) => o.id === payment.orderId) ?? null : null;
  const settlements = data.settlements.filter((s) => s.paymentId === tid);
  const refunds = data.refunds.filter((r) => r.paymentId === tid);
  const refundIds = new Set(refunds.map((r) => r.id));
  const ledger = data.ledger.filter((l) => l.referenceId.includes(tid) || refundIds.has(l.referenceId));
  const decision = decisions.find((d) => d.transactionId === tid) ?? null;
  return { transactionId: tid, order, payment, settlements, refunds, ledger, decision };
}

function retrieveRiskContext(decisions: DecisionResult[]) {
  return decisions.filter((d) => d.risk && d.risk.level !== "LOW")
    .sort((a, b) => (b.risk?.score ?? 0) - (a.risk?.score ?? 0)).slice(0, 10)
    .map((d) => ({ transactionId: d.transactionId, decision: d.decision, riskScore: d.risk!.score, riskLevel: d.risk!.level, riskSignals: d.risk!.signals }));
}

function retrieveAnomalyContext(decisions: DecisionResult[]) {
  return decisions.filter((d) => d.anomaly?.isAnomalous)
    .sort((a, b) => (b.anomaly?.anomalyScore ?? 0) - (a.anomaly?.anomalyScore ?? 0)).slice(0, 10)
    .map((d) => ({ transactionId: d.transactionId, decision: d.decision, anomalyScore: d.anomaly!.anomalyScore, severity: d.anomaly!.severity, signals: d.anomaly!.signals.map((s) => ({ title: s.title, explanation: s.explanation })) }));
}

function retrieveSummaryContext(decisions: DecisionResult[]) {
  const count = (d: string) => decisions.filter((x) => x.decision === d).length;
  return { total: decisions.length, matched: count("MATCHED"), reviewed: count("REVIEW"), mismatched: count("MISMATCH"), missing: count("MISSING"), refunded: count("REFUNDED"), highRisk: decisions.filter((d) => d.risk?.level === "HIGH").length, mediumRisk: decisions.filter((d) => d.risk?.level === "MEDIUM").length, anomalous: decisions.filter((d) => d.anomaly?.isAnomalous).length };
}

function buildPrompt(question: string, context: string): string {
  return [
    "You are Ask Adapt, a financial investigation assistant.",
    "You may ONLY use the FINANCIAL DATA provided below.",
    "Do NOT invent transaction IDs, amounts, dates, or any financial facts.",
    "If the data is insufficient, say: 'Adapt does not have enough evidence in the current dataset to answer that reliably.'",
    "Keep your answer concise and factual.",
    "Do NOT approve, reject, or execute any financial action.",
    "",
    "RESPONSE FORMAT:",
    "ANSWER: <concise grounded explanation>",
    "EVIDENCE: <comma-separated list of relevant record IDs>",
    "RECOMMENDATION: <only if supported by actual data>",
    "",
    `QUESTION: ${question}`,
    "",
    "FINANCIAL DATA:",
    context,
    "",
    "Answer using ONLY the data above. Do not invent anything.",
  ].join("\n");
}

function parseAnswer(raw: string): { answer: string; evidence: string[]; recommendation: string | null } {
  const lines = raw.split("\n").map((l) => l.trim());
  let answer = "";
  let evidence: string[] = [];
  let recommendation: string | null = null;
  let section = "ANSWER";
  for (const line of lines) {
    if (line.toUpperCase().startsWith("ANSWER:") || line.toUpperCase().startsWith("ANSWER :")) { section = "ANSWER"; answer = line.replace(/^ANSWER\s*:?\s*/i, "").trim(); continue; }
    if (line.toUpperCase().startsWith("EVIDENCE:") || line.toUpperCase().startsWith("EVIDENCE :")) { section = "EVIDENCE"; const evStr = line.replace(/^EVIDENCE\s*:?\s*/i, "").trim(); if (evStr) evidence = evStr.split(/[,;·•\n]+/).map((s) => s.trim()).filter(Boolean); continue; }
    if (line.toUpperCase().startsWith("RECOMMENDATION:") || line.toUpperCase().startsWith("RECOMMENDATION :")) { section = "RECOMMENDATION"; recommendation = line.replace(/^RECOMMENDATION\s*:?\s*/i, "").trim(); continue; }
    if (section === "ANSWER" && line) answer += (answer ? " " : "") + line;
    if (section === "EVIDENCE" && line) evidence.push(...line.split(/[,;·•]+/).map((s) => s.trim()).filter(Boolean));
    if (section === "RECOMMENDATION" && line) recommendation = (recommendation ? " " : "") + line;
  }
  if (!answer && !evidence.length) answer = raw.trim();
  return { answer: answer || "No answer generated.", evidence: [...new Set(evidence)].slice(0, 10), recommendation: recommendation?.trim() || null };
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

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "question is required." }, { status: 400 });
  if (question.length > 500) return Response.json({ error: "Question too long (max 500 chars)." }, { status: 400 });

  try {
    const data = await loadBundle();
    const report = reconcile(data);
    const decisions = report.decisions.map((d) => {
      const risk = scoreDecision(d);
      const anomaly = analyzeDecision(d);
      const resolution = recommendResolution(d);
      return { ...d, ...(risk && { risk: { score: risk.score, level: risk.level, signals: risk.signals } }), ...(anomaly && { anomaly }), ...(resolution && { resolution }) };
    });

    const { type, transactionId } = classifyQuestion(question);
    let contextStr: string;

    if ((type === "TRANSACTION" || type === "MONEY_FLOW") && transactionId) {
      const ctx = retrieveTransactionContext(data, decisions, transactionId);
      if (!ctx.payment) {
        return Response.json({ answer: `Transaction ${transactionId} was not found in the current Adapt dataset.`, evidence: [], recommendation: null, source: "Adapt financial records", aiProvider: null });
      }
      contextStr = JSON.stringify({ transaction: ctx.transactionId, order: ctx.order, payment: ctx.payment, settlements: ctx.settlements, refunds: ctx.refunds, ledger: ctx.ledger, reconciliation: ctx.decision ? { decision: ctx.decision.decision, confidence: ctx.decision.confidence, reason: ctx.decision.reason, source: ctx.decision.source, aiStatus: ctx.decision.aiStatus, risk: ctx.decision.risk, anomaly: ctx.decision.anomaly ? { isAnomalous: ctx.decision.anomaly.isAnomalous, anomalyScore: ctx.decision.anomaly.anomalyScore, severity: ctx.decision.anomaly.severity } : undefined, resolution: ctx.decision.resolution, evidence: ctx.decision.evidence } : null }, null, 2);
    } else if (type === "RISK") {
      contextStr = JSON.stringify({ highestRiskTransactions: retrieveRiskContext(decisions) }, null, 2);
    } else if (type === "ANOMALY") {
      contextStr = JSON.stringify({ anomalousTransactions: retrieveAnomalyContext(decisions) }, null, 2);
    } else if (type === "RECONCILIATION") {
      contextStr = JSON.stringify({ reconciliationSummary: retrieveSummaryContext(decisions) }, null, 2);
    } else {
      contextStr = JSON.stringify({ summary: retrieveSummaryContext(decisions), topRiskTransactions: retrieveRiskContext(decisions).slice(0, 5), topAnomalousTransactions: retrieveAnomalyContext(decisions).slice(0, 5) }, null, 2);
    }

    const prompt = buildPrompt(question, contextStr);
    const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
    const model = process.env.OLLAMA_MODEL || "qwen2.5:1.5b";
    const envTimeout = Number(process.env.OLLAMA_TIMEOUT_MS);
    const effectiveTimeout = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 45000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);

    let rawAnswer: string;
    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, stream: false, keep_alive: "10m", options: { temperature: 0, num_predict: 500 } }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const responseText = await response.text();
      const responseBody = JSON.parse(responseText) as Record<string, unknown>;
      if (typeof responseBody.response !== "string" || !responseBody.response.trim()) throw new Error("Empty Ollama response");
      rawAnswer = responseBody.response;
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      console.error("[ASK ADAPT ERROR]", JSON.stringify({ question: question.slice(0, 100), model, errorName: error instanceof Error ? error.name : typeof error, errorMessage: error instanceof Error ? error.message : String(error) }));
      return Response.json({
        answer: isAbort ? "The local AI model took too long to respond. Please try a shorter or simpler question." : "Local AI is currently unavailable. Adapt could not generate an AI explanation.",
        evidence: [], recommendation: null, source: "Adapt financial records", aiProvider: null,
      });
    } finally {
      clearTimeout(timer);
    }

    const parsed = parseAnswer(rawAnswer);
    return Response.json({ answer: parsed.answer, evidence: parsed.evidence, recommendation: parsed.recommendation, source: "Adapt financial records", aiProvider: `ollama:${model}` });
  } catch (error) {
    console.error("[ASK ADAPT ERROR]", error instanceof Error ? error.message : error);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}



