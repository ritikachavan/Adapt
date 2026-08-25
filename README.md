# Adapt

## AI-Powered Financial Reconciliation & Control Intelligence

Adapt is an AI-powered financial operations platform that goes beyond detecting reconciliation discrepancies.

It combines deterministic financial reconciliation, risk intelligence, anomaly detection, AI investigation, recommendations, human review, correction, auditability, feedback, and grounded natural-language investigation into one control workflow.

> Detect → Understand → Investigate → Recommend → Act → Audit → Learn

Adapt is built around a simple principle:

> Deterministic logic establishes financial facts. AI investigates ambiguity. Humans remain in control.

---

## The Problem

Traditional reconciliation systems are good at identifying that something does not match.

But finance teams still need to answer:

- What happened?
- Why is this transaction unusual?
- Which records support the conclusion?
- How risky is it?
- What should happen next?
- Should a human approve the action?
- What happened after the decision?
- Can the entire decision be audited later?

Adapt closes that operational loop.

Instead of stopping at:

REVIEW

Adapt provides:

DETECT
↓
UNDERSTAND
↓
INVESTIGATE
↓
RECOMMEND
↓
HUMAN DECISION
↓
CORRECTION / RESOLUTION
↓
AUDIT
↓
FEEDBACK / MEMORY

---

# Core Capabilities

## 1. Deterministic Reconciliation

Adapt begins with deterministic financial reconciliation.

Supported outcomes:

- MATCHED
- MISMATCH
- MISSING
- REFUNDED
- REVIEW

The deterministic engine remains authoritative for deterministic cases.

It evaluates relationships across:

- Orders
- Payments
- Settlements
- Refunds
- Ledger entries

The reconciliation engine records:

- Candidate matches
- Evidence
- Confidence
- Matched record IDs
- Reconciliation reasons

---

## 2. AI Investigation

Ambiguous transactions can be escalated to the local AI provider.

Current provider:

Ollama
Model: qwen2.5:1.5b

For ambiguous transactions, AI investigates:

- What happened
- Why the transaction is unusual
- Supporting evidence
- Potential risk
- Recommended next action
- Confidence

AI is used as an investigation layer rather than an unrestricted financial decision-maker.

If AI cannot provide a valid result, the transaction remains safely in human review.

---

## 3. AI Safety

Adapt does not blindly trust LLM output.

AI responses are validated for:

- Decision
- Confidence
- Matched record ID
- Reason
- Evidence

The system rejects:

- Malformed responses
- Invalid decisions
- Invalid confidence values
- Hallucinated record IDs
- Missing required fields
- Invalid evidence

When AI output is unavailable or invalid:

Decision: REVIEW
Confidence: 0%
Human review required

AI cannot silently approve a financially significant transaction.

---

## 4. Per-Transaction AI State

Adapt tracks AI state at the individual transaction level.

Possible states:

- AI_SUCCESS
- AI_FALLBACK
- AI_SKIPPED
- AI_NOT_REQUESTED

This distinguishes between:

- Transactions actually investigated by AI
- Transactions intentionally skipped by the escalation policy
- AI investigations that failed safely
- Runs where AI was not requested

The AI state is surfaced consistently across the dashboard, review queue, transaction views, and investigation surfaces.

---

## 5. Risk Intelligence

Adapt calculates an explainable risk score from available financial signals.

Signals can include:

- Amount variance
- Settlement variance
- Missing records
- Refund irregularities
- Ledger inconsistencies
- Timing anomalies
- Duplicate or similar transactions
- Reconciliation uncertainty
- Historical anomaly signals

Example:

Risk Score: 82 / 100
Risk Level: HIGH

Amount variance       +32
Settlement delay      +18
Ledger inconsistency  +21
Historical anomaly    +11

Total                   82

Risk scores are explainable heuristic/model indicators and should not be interpreted as guarantees.

---

## 6. Anomaly Intelligence

Adapt identifies unusual financial patterns such as:

- Unusual amounts
- Settlement variance
- Settlement delays
- Refund spikes
- Duplicate transactions
- Unusual transaction frequency
- Ledger inconsistencies
- Unusual timing
- Recurring mismatch patterns

Anomalies expose:

- Anomaly score
- Severity
- Signal
- Affected transactions
- Financial impact

---

## 7. Anomaly Clustering

Adapt can group related anomalies into clusters instead of presenting every anomaly independently.

Example:

Settlement Adjustment Cluster

12 transactions
₹182,450 affected
HIGH severity

Common signal:
Settlement amount variance

Clusters help identify recurring operational problems and investigate related transactions together.

---

## 8. What Changed?

Adapt can compare available groups or dataset periods to identify meaningful changes.

Examples include:

- Settlement anomaly changes
- Refund activity changes
- Settlement delay changes
- Mismatch-rate changes
- Transaction-volume changes

All comparisons are based on available data.

Adapt does not pretend that synthetic data represents real production history.

---

## 9. Resolution Intelligence

Adapt goes beyond identifying a problem.

It can recommend the next operational action.

Possible recommendations include:

- Approve reconciliation
- Investigate settlement
- Request settlement trace
- Verify refund
- Check ledger entry
- Review duplicate payment
- Escalate to finance
- Create correction
- Mark resolved

Recommendations are advisory.

Human approval remains required for significant financial actions.

---

## 10. Explainable Recommendations

Adapt provides a way to understand why a recommendation was generated.

Example:

WHY THIS RECOMMENDATION?

Risk Signals
----------------
Amount variance
Settlement delay
Ledger inconsistency
Historical anomaly

Risk Score
82 / 100

Evidence
----------------
Payment
Settlement
Ledger
Transaction history

↓

Recommended Action
----------------
Investigate settlement adjustment

Human approval required

This allows operators to inspect the reasoning signals and evidence instead of treating the recommendation as a black box.

---

## 11. Transaction Investigation

Each transaction can be investigated as a complete financial record.

The investigation view brings together:

- Transaction details
- Order
- Payment
- Settlement
- Refund
- Ledger
- Reconciliation decision
- Evidence
- Risk
- Anomaly signals
- AI investigation
- Recommendation
- Human decision
- Correction
- Memory

This provides a single place to understand what happened to a transaction.

---

## 12. Transaction Flight Recorder

Adapt provides a chronological view of the financial lifecycle of a transaction.

Conceptually:

ORDER CREATED
↓
PAYMENT RECEIVED
↓
PAYMENT CONFIRMED
↓
SETTLEMENT
↓
REFUND
↓
LEDGER ENTRY
↓
RECONCILIATION
↓
AI INVESTIGATION
↓
RECOMMENDATION
↓
HUMAN DECISION

Only events supported by the available transaction data are displayed.

Each event can expose supporting evidence and details.

---

## 13. Decision Replay

Adapt provides a replayable view of how a transaction reached its current state.

Conceptually:

Financial Records
↓
Deterministic Reconciliation
↓
AI Investigation
↓
Human Review
↓
Correction / Decision
↓
Memory

This helps answer:

"Why did Adapt make this decision?"

The system preserves the distinction between:

- Original deterministic decision
- AI investigation
- Human review
- Correction
- Later memory/feedback

---

## 14. Human-in-the-Loop Control

Adapt keeps humans in control of financially significant decisions.

Reviewers can take actions such as:

- APPROVE
- REJECT
- CORRECT
- ESCALATE
- REQUEST TRACE
- MARK RESOLVED

Human actions are recorded for auditability.

AI recommendations do not automatically execute financial corrections.

---

## 15. Audit Trail

Important financial decisions can be traced through the system.

Auditable events include:

- Original reconciliation decision
- Evidence
- AI investigation
- AI recommendation
- Human decision
- Correction
- Timestamp
- Actor
- Previous value
- New value

The goal is to make financial decisions explainable and reviewable after the fact.

---

## 16. Feedback & Memory

Adapt can retain correction and resolution information for later recall.

Tracked outcomes can include:

- AI recommendation accepted
- AI recommendation rejected
- Human override
- Correction
- Resolution

Stored memory is treated as historical feedback.

It does not silently rewrite the original deterministic decision.

---

## 17. Financial Health

The dashboard summarizes reconciliation health using available indicators such as:

- Reconciliation rate
- Match rate
- Mismatch rate
- Missing records
- Review volume
- Anomaly volume
- Settlement variance
- Refund anomalies
- Ledger consistency

All displayed financial metrics are calculated from the available dataset.

---

# Ask Adapt

## Grounded Financial Investigation Copilot

Ask Adapt allows operators to ask natural-language questions about the current financial dataset.

Example:

"Where did the money from pay_0010 go?"

Adapt retrieves relevant financial records and provides a grounded response.

Supported question categories include:

- Transaction questions
- Money-flow questions
- Risk questions
- Anomaly questions
- Reconciliation questions
- General financial questions

Example:

Question:
Where did the money from pay_0010 go?

Answer:
The transaction is associated with a ₹249 payment and a corresponding ₹249 ledger credit in the current dataset.

Ask Adapt is:

- Grounded in the actual dataset
- Read-only
- Evidence-aware
- Protected against fabricated IDs and amounts

Unknown transactions are handled explicitly.

Example:

Question:
Where did pay_DOES_NOT_EXIST go?

Answer:
Transaction not found in the current Adapt dataset.

If available evidence is insufficient, Adapt explicitly reports that rather than inventing an answer.

Ask Adapt never modifies financial records.

---

# Local AI

Adapt currently uses local Ollama inference.

LOCAL AI ACTIVE

Provider:
Ollama

Model:
qwen2.5:1.5b

The local AI provider powers:

- AI Investigation
- AI reconciliation escalation
- Ask Adapt grounded investigation

The local AI indicator describes the current provider configuration and should not be interpreted as an absolute security or privacy guarantee.

---

# Command Center Dashboard

The main Adapt dashboard is designed as a financial intelligence command center.

It brings together:

- Total transactions
- Transaction value
- Reconciliation health
- Matched transactions
- Mismatches
- Missing records
- Refunds
- Review queue
- Risk
- Anomalies
- AI investigation state
- Financial health
- Investigation insights
- Audit information

The goal is to let an operator understand the state of the financial system quickly and move directly into investigation.

---

# AI CFO Briefing

Adapt can surface executive-level intelligence from the available dataset.

The briefing is designed to answer:

- What is healthy?
- What changed?
- What is unusual?
- What is risky?
- What should happen next?

Example:

"87% of transactions were reconciled automatically."

"7 high-risk cases require attention."

"Settlement discrepancies increased in the current dataset period."

All statements must be grounded in actual calculated data.

---

# Demo Workflow

Adapt is designed for a live demonstration.

The intended story is:

100 TRANSACTIONS
↓
RECONCILIATION
↓
RISK ANALYSIS
↓
ANOMALY DETECTION
↓
AI INVESTIGATION
↓
RECOMMENDATION
↓
HUMAN DECISION
↓
AUDIT
↓
FEEDBACK
↓
FINANCIAL HEALTH

The demo should demonstrate that Adapt does not simply identify financial discrepancies.

It explains them and helps operators decide what to do next while preserving human control.

---

# Architecture

Financial Data
|
v
Deterministic Reconciliation
|
+----------------------+
|                      |
v                      v
Risk Engine       Anomaly Engine
|                      |
+----------+-----------+
           |
           v
    Ambiguous Cases
           |
           v
     AI Investigator
         Ollama
           |
           v
    Recommendation
           |
           v
      Human Review
           |
     +-----+-----+
     |           |
     v           v
 Correction     Audit
     |           |
     +-----+-----+
           |
           v
     Feedback / Memory

---

# Technology Stack

- Next.js
- React
- TypeScript
- Local Ollama inference
- JSON-based financial dataset
- Deterministic reconciliation engine
- Explainable risk intelligence
- Anomaly detection
- REST API routes
- Automated tests

Ask Adapt does not require an additional dependency.

---

# Dataset

Adapt currently operates on a synthetic financial dataset containing:

- orders.json
- payments.json
- settlements.json
- refunds.json
- ledger.json

The dataset represents relationships across:

- Orders
- Payments
- Settlements
- Refunds
- Ledger entries

The current demo dataset contains 100 transactions.

All financial metrics shown by Adapt are calculated from the available dataset.

The dataset is synthetic and should not be interpreted as production financial data.

---

# Verification

The current implementation has been verified with:

Reconciliation tests: 128 / 128 PASS
API tests: PASS
Typecheck: PASS
Production build: PASS

Core reconciliation: PASS
AI investigation: PASS
Ollama invocation: PASS
Review queue: PASS
Transaction investigation: PASS
Decision replay: PASS
Human review: PASS
Correction: PASS
Audit: PASS
Memory: PASS

Ask Adapt UI: PASS
Ask Adapt API: PASS
Grounded retrieval: PASS
Unknown transaction handling: PASS
Insufficient evidence handling: PASS
AI unavailable handling: PASS
Hallucination protection: PASS
Financial mutation protection: PASS

Example verified behavior:

Question:
Where did the money from pay_0010 go?

Result:
Grounded ledger information for the transaction was successfully retrieved.

Unknown transaction:

Question:
Where did pay_DOES_NOT_EXIST go?

Result:
Transaction not found in the current Adapt dataset.

The AI investigation path has also been verified with successful Ollama responses and safe fallback behavior.

---

# Project Structure

Adapt/
|
+-- app/
|   +-- api/
|   |   +-- reconcile/
|   |   +-- review/
|   |   +-- audit/
|   |   +-- correct/
|   |   +-- memory/
|   |   +-- ask/
|   |
|   +-- dashboard/
|
+-- components/
|   +-- dashboard/
|
+-- lib/
|   +-- ai/
|   +-- reconciliation/
|   +-- types/
|
+-- data/
|   +-- orders.json
|   +-- payments.json
|   +-- settlements.json
|   +-- refunds.json
|   +-- ledger.json
|
+-- tests/

---

# Running Adapt Locally

## Requirements

- Node.js
- npm
- Ollama

Install dependencies:

npm install

Install the configured Ollama model:

ollama pull qwen2.5:1.5b

Make sure Ollama is running.

Example environment configuration:

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:1.5b
OLLAMA_TIMEOUT_MS=45000

Verify Ollama:

curl http://localhost:11434/api/tags

On Windows PowerShell:

Invoke-WebRequest http://localhost:11434/api/tags

Start the development server:

npm run dev

Then open the local Adapt dashboard.

---

# Design Principles

## Deterministic First

Financial facts should be established by deterministic reconciliation wherever possible.

## AI for Ambiguity

AI is used where reasoning over ambiguous evidence can provide additional investigative value.

## Humans Stay in Control

AI recommendations do not automatically execute significant financial corrections.

## Evidence Over Claims

Important conclusions should be traceable to underlying financial records.

## Safe Failure

If AI is unavailable or produces invalid output, Adapt falls back to human review rather than silently guessing.

## Honest Exceptions

Unresolved financial cases remain visible instead of being hidden behind optimistic success metrics.

---

# Security & Safety Philosophy

Adapt is designed around controlled AI usage.

AI is not treated as an authority over financial truth.

The system follows:

Deterministic facts
↓
Evidence
↓
AI investigation
↓
Human approval
↓
Auditable action

AI cannot:

- Invent financial records
- Invent transaction IDs
- Invent amounts
- Silently override deterministic decisions
- Automatically execute significant financial corrections

Ask Adapt is read-only.

The current prototype does not include production authentication or production-grade financial authorization.

---

# Limitations

Adapt is a hackathon prototype and should not be treated as a production financial system.

Current limitations include:

- Synthetic financial dataset
- Local AI model with limited inference capacity
- Prototype-scale storage
- Heuristic/statistical risk and anomaly analysis
- Limited historical data
- No production authentication
- No production payment-system integrations
- No autonomous financial execution

These limitations are outside the current prototype scope.

The architecture is intentionally focused on demonstrating financial intelligence, explainability, AI investigation, and human control.

---

# Why Adapt Is Different

Most reconciliation systems answer:

"Does this transaction match?"

Adapt asks:

"Why does it not match, how risky is it, what evidence supports that conclusion, what should happen next, and what did the human decide?"

That creates a complete operational intelligence loop:

DETECT
↓
UNDERSTAND
↓
INVESTIGATE
↓
PREDICT
↓
RECOMMEND
↓
ACT
↓
AUDIT
↓
LEARN

---

# Final Product Vision

Adapt is not simply a reconciliation dashboard.

It is a financial intelligence and control platform designed to help finance teams move from:

DISCREPANCY

to:

EXPLANATION

to:

RISK

to:

RECOMMENDATION

to:

HUMAN DECISION

to:

AUDITABLE RESOLUTION

---

# Adapt

## Detect. Understand. Recommend. Control.

Adapt turns financial discrepancies into explainable investigations, actionable recommendations, controlled human decisions, and auditable outcomes.
