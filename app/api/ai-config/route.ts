import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai-config
 *
 * Secret-free AI provider configuration status, derived from the RUNNING
 * server process environment at request time.
 *
 * Purpose: the dashboard must never infer provider configuration from
 * whether AI metrics happened to populate on a given run ("not measured"
 * is not the same as "not configured"). This endpoint reports actual
 * configuration booleans directly from process.env.
 *
 * SECURITY: API key values are never returned, logged, or included in any
 * field. Only boolean presence indicators and non-secret model labels.
 */
export function GET() {
  // Non-secret model identifiers (safe to display).
  const ollamaModel = process.env.OLLAMA_MODEL ?? null;
  const groqModel = process.env.GROQ_MODEL ?? null;

  // Presence booleans only — never key values.
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);

  // Dual-agent verification is available when the Challenge Analyst has a key.
  const dualAgentCapable = groqConfigured;

  // Whether an explicit base URL override exists (default host is implicit).
  const ollamaBaseUrlOverride = Boolean(process.env.OLLAMA_BASE_URL);
  const groqBaseUrl = process.env.GROQ_BASE_URL ?? null;

  return NextResponse.json({
    ollamaModel,
    groqModel,
    groqConfigured,
    dualAgentCapable,
    ollamaBaseUrlOverride,
    groqBaseUrl,
  });
}