"use client";

/**
 * Decision Passport — shows the full AI verification trail for a transaction.
 * Designed so a finance reviewer can understand an ambiguous case in ~10 seconds.
 */

interface EvidenceItem {
  field: string;
  expected?: string | number | null;
  actual?: string | number | null;
  detail?: string;
}

interface DualAgentData {
  mode: "SINGLE_AGENT" | "DUAL_AGENT";
  ollamaDecision: string | null;
  ollamaConfidence: number | null;
  groqDecision: string | null;
  groqConfidence: number | null;
  evidenceValidationPassed: boolean | null;
  evidenceValidationErrors: string[];
  adjudication: "AGREED" | "DISAGREED" | "EVIDENCE_FAILED" | "PROVIDER_UNAVAILABLE" | "FALLBACK" | null;
}

interface PassportProps {
  transactionId: string;
  decision: string;
  confidence: number;
  reason: string;
  evidence: EvidenceItem[];
  aiStatus?: string;
  dualAgent?: DualAgentData;
  matchedRecordId: string | null;
}

const ADJ: Record<string, { label: string; color: string; explanation: string }> = {
  AGREED: { label: "AGREED", color: "bg-emerald-100 text-emerald-800", explanation: "Both analysts reached the same decision and their cited evidence passed deterministic validation." },
  DISAGREED: { label: "DISAGREED", color: "bg-amber-100 text-amber-800", explanation: "The analysts reached different conclusions. Human review is required." },
  EVIDENCE_FAILED: { label: "EVIDENCE FAILED", color: "bg-rose-100 text-rose-800", explanation: "One or more AI claims could not be verified against source records." },
  PROVIDER_UNAVAILABLE: { label: "PROVIDER UNAVAILABLE", color: "bg-slate-100 text-slate-700", explanation: "An AI provider was unavailable. No AI recommendation was accepted." },
  FALLBACK: { label: "FALLBACK", color: "bg-amber-100 text-amber-800", explanation: "AI verification did not produce a safe recommendation. Human review is required." },
};

function fmtConf(v: number | null): string {
  return v === null ? "Not available" : `${Math.round(v * 100)}%`;
}

function escalationReason(reason: string, decision: string): string {
  if (reason.includes("Ambiguity detected")) return reason;
  if (decision === "MISMATCH") return "Settlement amount does not reconcile with the payment.";
  if (decision === "MISSING") return "No valid settlement evidence was found for this payment.";
  if (decision === "REVIEW") return "Available evidence is ambiguous and requires investigation.";
  return reason;
}

function humanInstruction(decision: string, reason: string): string {
  if (reason.includes("duplicate")) return "Determine whether the duplicate candidate is a legitimate double-order or a data error.";
  if (decision === "MISMATCH") return "Determine whether the amount difference represents a legitimate settlement adjustment.";
  if (decision === "MISSING") return "Determine whether settlement evidence exists elsewhere or the payment has not settled.";
  if (reason.includes("[Dual-Agent Agreement]")) return "Review and approve the AI recommendation before any financial action is taken.";
  return "Review the available evidence and determine the correct reconciliation outcome.";
}

function getExposure(decision: string, evidence: EvidenceItem[]): string | null {
  const stl = evidence.find((e) => e.field === "settlement.total" && typeof e.expected === "number");
  if (!stl || typeof stl.expected !== "number") return null;
  if (decision === "MISMATCH" && typeof stl.actual === "number") {
    const diff = Math.abs(stl.expected - stl.actual);
    if (diff === 0) return `₹${stl.expected.toLocaleString("en-IN")} under review`;
    return `₹${diff.toLocaleString("en-IN")} unexplained difference`;
  }
  if (decision === "MISSING") {
    return `₹${stl.expected.toLocaleString("en-IN")} — no settlement found`;
  }
  if (decision === "REVIEW") {
    return `₹${stl.expected.toLocaleString("en-IN")} under review`;
  }
  return null;
}

function getKnownFacts(evidence: EvidenceItem[], decision: string, matchedRecordId: string | null): string[] {
  const facts: string[] = [];
  facts.push(`Transaction classified as ${decision}`);
  const stl = evidence.find((e) => e.field === "settlement.total");
  if (stl) {
    if (typeof stl.expected === "number") facts.push(`Expected amount: ₹${stl.expected.toLocaleString("en-IN")}`);
    if (typeof stl.actual === "number") facts.push(`Settlement amount: ₹${stl.actual.toLocaleString("en-IN")}`);
  }
  if (matchedRecordId) facts.push(`Settlement record: ${matchedRecordId}`);
  const dup = evidence.find((e) => e.field === "duplicate.lookalike");
  if (dup && dup.actual) facts.push(`Possible duplicate: ${dup.actual}`);
  const nearDup = evidence.find((e) => e.field === "reference.nearDuplicate");
  if (nearDup) facts.push("Near-duplicate customer reference detected");
  const delay = evidence.find((e) => e.field === "settlement.delayDays");
  if (delay && typeof delay.actual === "number") facts.push(`Settlement delayed ${delay.actual} days`);
  return facts;
}

function getUnknowns(decision: string, reason: string): string[] {
  const unknowns: string[] = [];
  if (decision === "REVIEW" || decision === "MISMATCH") {
    unknowns.push("Whether the business should approve this exception");
  }
  if (decision === "MISSING") {
    unknowns.push("Whether settlement evidence exists in another system");
    unknowns.push("Whether the payment has actually settled");
  }
  if (reason.includes("duplicate")) {
    unknowns.push("Whether the duplicate is a legitimate double-order or a data error");
  }
  if (decision === "MISMATCH") {
    unknowns.push("Whether the amount difference is a legitimate adjustment");
  }
  unknowns.push("Any business decision not supported by source records");
  return unknowns;
}

export default function DecisionPassport({ transactionId, decision, confidence, reason, evidence, aiStatus, dualAgent, matchedRecordId }: PassportProps) {
  const isAi = aiStatus === "AI_SUCCESS" || aiStatus === "AI_FALLBACK";
  const isDual = dualAgent?.mode === "DUAL_AGENT";
  const adj = dualAgent?.adjudication ? ADJ[dualAgent.adjudication] : null;
  const exposure = getExposure(decision, evidence);
  const known = getKnownFacts(evidence, decision, matchedRecordId);
  const unknowns = getUnknowns(decision, reason);

  return (
    <section className="rounded-lg border border-slate-200 bg-white" aria-label="Decision Passport">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision Passport</h3>
      </div>
      <div className="px-4 py-3 space-y-3">
        {/* Case Summary */}
        <div className="space-y-1.5">
          <Row label="Transaction" value={<span className="font-mono font-semibold">{transactionId}</span>} />
          <Row label="Status" value={<span className="font-bold">{decision}</span>} />
          <Row label="Decision confidence" value={<span className="tabular-nums" title="Internal evidence-based routing score, not a calibrated probability">{Math.round(confidence * 100)}%</span>} />
          {matchedRecordId && <Row label="Matched record" value={<span className="font-mono font-semibold text-emerald-700">{matchedRecordId}</span>} />}
          {exposure && <Row label="Financial exposure" value={<span className="font-semibold text-rose-700">{exposure}</span>} />}
        </div>

        {/* Why escalated */}
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Why this case was escalated</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-700">{escalationReason(reason, decision)}</p>
        </div>

        {/* AI Analysis */}
        {isAi && isDual && dualAgent && (
          <>
            <Divider label="AI Analysis" />
            <AgentCard title="Resolution Analyst" provider="Ollama" desc="Produces an initial evidence-based recommendation." color="indigo" decision={dualAgent.ollamaDecision} confidence={dualAgent.ollamaConfidence} />
            <AgentCard title="Challenge Analyst" provider="Groq" desc="Independently reviews the same evidence and challenges the first perspective." color="violet" decision={dualAgent.groqDecision} confidence={dualAgent.groqConfidence} />
            <ValidationCard passed={dualAgent.evidenceValidationPassed} errors={dualAgent.evidenceValidationErrors} />
            {adj && <AdjudicationCard label={adj.label} color={adj.color} explanation={adj.explanation} />}
          </>
        )}

        {isAi && !isDual && (
          <div className="rounded-md border border-violet-100 bg-violet-50/30 px-3 py-2">
            <p className="text-[10px] font-semibold text-violet-800">AI Investigation</p>
            <p className="text-[9px] text-violet-600">Single-agent investigation using the available AI provider.</p>
          </div>
        )}

        {/* Known vs Unknown */}
        <Divider label="Known vs Unknown" />
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-emerald-100 bg-emerald-50/30 px-3 py-2">
            <p className="text-[10px] font-semibold text-emerald-800">Known</p>
            <ul className="mt-1 space-y-0.5">
              {known.map((f, i) => (
                <li key={i} className="text-[10px] text-emerald-700">• {f}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-amber-100 bg-amber-50/30 px-3 py-2">
            <p className="text-[10px] font-semibold text-amber-800">Unknown</p>
            <ul className="mt-1 space-y-0.5">
              {unknowns.map((u, i) => (
                <li key={i} className="text-[10px] text-amber-700">• {u}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Human Decision */}
        <Divider label="Human Review Required" />
        <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2">
          <p className="text-[10px] font-semibold text-emerald-800">What decision do I need to make?</p>
          <p className="mt-1 text-[11px] leading-relaxed text-emerald-700">{humanInstruction(decision, reason)}</p>
          <p className="mt-1.5 text-[10px] font-semibold text-emerald-800">Human approval required · No automatic financial mutation occurred.</p>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <span className="text-[11px] text-slate-800">{value}</span>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="border-t border-slate-100 pt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function AgentCard({ title, provider, desc, color, decision, confidence }: {
  title: string; provider: string; desc: string; color: "indigo" | "violet";
  decision: string | null; confidence: number | null;
}) {
  const border = color === "indigo" ? "border-indigo-100" : "border-violet-100";
  const bg = color === "indigo" ? "bg-indigo-50/30" : "bg-violet-50/30";
  const text = color === "indigo" ? "text-indigo-800" : "text-violet-800";
  const sub = color === "indigo" ? "text-indigo-600" : "text-violet-600";
  return (
    <div className={`rounded-md border ${border} ${bg} px-3 py-2`}>
      <p className={`text-[10px] font-semibold ${text}`}>{title}</p>
      <p className={`text-[9px] ${sub}`}>{provider} · {desc}</p>
      <div className="mt-1.5 flex items-center gap-3">
        <span className={`text-[11px] font-bold ${text}`}>{decision ?? "Not available"}</span>
        <span className={`text-[10px] ${sub}`}>{fmtConf(confidence)}</span>
      </div>
    </div>
  );
}

function ValidationCard({ passed, errors }: { passed: boolean | null; errors: string[] }) {
  return (
    <div className="rounded-md border border-slate-200 px-3 py-2">
      <p className="text-[10px] font-semibold text-slate-700">Evidence Validation</p>
      <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
        {passed === null ? "Not measured" : passed ? "PASSED" : "FAILED"}
      </span>
      {errors.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {errors.map((err, i) => (
            <li key={i} className="text-[10px] text-rose-700">• {err}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdjudicationCard({ label, color, explanation }: { label: string; color: string; explanation: string }) {
  return (
    <div className="rounded-md border border-slate-200 px-3 py-2">
      <p className="text-[10px] font-semibold text-slate-700">Adjudication</p>
      <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${color}`}>{label}</span>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{explanation}</p>
    </div>
  );
}