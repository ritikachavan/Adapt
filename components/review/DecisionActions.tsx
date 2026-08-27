"use client";

import { useState } from "react";

const ACTION_BUTTONS = [
  { label: "Confirm / Match", value: "MATCHED", classes: "bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600" },
  { label: "Mark Review", value: "REVIEW", classes: "bg-amber-500 hover:bg-amber-600 focus-visible:outline-amber-500" },
  { label: "Mark Mismatch", value: "MISMATCH", classes: "bg-rose-600 hover:bg-rose-700 focus-visible:outline-rose-600" },
  { label: "Mark Missing", value: "MISSING", classes: "bg-orange-500 hover:bg-orange-600 focus-visible:outline-orange-500" },
  { label: "Mark Refunded", value: "REFUNDED", classes: "bg-sky-600 hover:bg-sky-700 focus-visible:outline-sky-600" },
] as const;

const CORRECTION_TYPES = [
  "WRONG_MATCH",
  "FALSE_POSITIVE",
  "MISCLASSIFIED",
  "FEE_MISREAD",
  "SPLIT_OVERLOOKED",
  "DUPLICATE_CONFIRMED_LEGIT",
  "OTHER",
] as const;

// Placeholder explanations that are too trivial to be meaningful
const REJECTED_PLACEHOLDERS = [
  "why wrong",
  "duplicate",
  "wrong",
  "not correct",
  "incorrect",
  "fix",
  "update",
  "change",
  "mistake",
  "error",
  "n/a",
  "na",
  "none",
  "no",
  "ok",
  "okay",
  "test",
  "testing",
  "asdf",
  "qwerty",
];

const MIN_EXPLANATION_LENGTH = 10;

function isMeaningfulExplanation(text: string): { valid: boolean; reason: string } {
  const trimmed = text.trim();
  if (trimmed.length < MIN_EXPLANATION_LENGTH) {
    return { valid: false, reason: `Explanation must be at least ${MIN_EXPLANATION_LENGTH} characters.` };
  }
  const lower = trimmed.toLowerCase();
  if (REJECTED_PLACEHOLDERS.includes(lower)) {
    return { valid: false, reason: "Explanation is too generic. Please describe why the engine verdict is wrong for this case." };
  }
  // Check for repeated characters (e.g., "aaaaaaa")
  if (/(.)\1{4,}/.test(lower)) {
    return { valid: false, reason: "Explanation appears to be placeholder text. Please provide a substantive explanation." };
  }
  return { valid: true, reason: "" };
}

interface DecisionActionsProps {
  /** True when no case is selected in the queue. */
  disabled?: boolean;
  submitting: boolean;
  error?: string | null;
  onSubmit: (
    correctedDecision: string,
    correctionType: string,
    explanation: string
  ) => void;
}

/**
 * Correction form: five explicit verdict actions sharing one correction type
 * and explanation. Buttons stay disabled while submitting or when the required
 * explanation is too short — nothing is submitted implicitly.
 */
export default function DecisionActions({
  disabled = false,
  submitting,
  error,
  onSubmit,
}: DecisionActionsProps) {
  const [explanation, setExplanation] = useState("");
  const [correctionType, setCorrectionType] = useState<string>(
    CORRECTION_TYPES[0]
  );

  const explanationCheck = isMeaningfulExplanation(explanation);
  const ready = !disabled && !submitting && explanationCheck.valid;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">
        Human correction
      </h3>

      {disabled ? (
        <p className="mt-2 text-sm text-slate-500">
          Select a case from the queue to record a correction.
        </p>
      ) : (
      <div className="mt-3 space-y-3">
      <div>
        <label
          htmlFor="correction-type"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Correction type
        </label>
        <select
          id="correction-type"
          value={correctionType}
          onChange={(e) => setCorrectionType(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100"
          disabled={submitting}
        >
          {CORRECTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="correction-explanation"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Explanation <span className="normal-case text-slate-400">(required)</span>
        </label>
        <textarea
          id="correction-explanation"
          rows={3}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Why is the engine verdict wrong for this case? Describe the specific evidence or reasoning."
          className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100"
          disabled={submitting}
        />
        {!explanationCheck.valid && explanation.trim().length > 0 && (
          <p className="mt-1 text-[11px] text-rose-600">{explanationCheck.reason}</p>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {ACTION_BUTTONS.map((action) => (
          <button
            key={action.value}
            type="button"
            disabled={!ready || submitting}
            onClick={() =>
              onSubmit(action.value, correctionType, explanation.trim())
            }
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${action.classes}`}
          >
            {submitting ? "Saving…" : action.label}
          </button>
        ))}
      </div>
      {!ready && !submitting && (
        <p className="text-[11px] text-slate-400">
          Write a substantive explanation (min. {MIN_EXPLANATION_LENGTH} characters, no generic placeholders) to enable the actions.
        </p>
      )}
      </div>
      )}
    </section>
  );
}
