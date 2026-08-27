
# 🧠 ADAPT

## AI Finance Controller

> **Reconcile. Investigate. Explain. Keep humans in control.**

ADAPT is an AI-assisted financial reconciliation and exception-management system for payment and settlement operations.

It is built around a simple principle:

> **Deterministic logic establishes financial facts. AI reasons about ambiguity. Evidence constrains AI. Humans retain financial authority.**

## ⚡ Why ADAPT?

Traditional reconciliation can answer:

> **"Did these records match?"**

Finance operations need to answer more:

- Why did this transaction fail to reconcile?
- Is this a duplicate or a legitimate transaction?
- Which settlement is actually relevant?
- What evidence supports the conclusion?
- What remains uncertain?
- What should the investigator do next?
- Should AI even be involved?

**ADAPT is designed around those questions.**


# 🏗️ Architecture

                    TRANSACTIONS
                         │
                         ▼
              ┌─────────────────────┐
              │   DETERMINISTIC     │
              │   RECONCILIATION    │
              │                     │
              │ Amount              │
              │ References          │
              │ Dates               │
              │ Settlement          │
              │ Lifecycle           │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ RISK + ANOMALY      │
              │ INTELLIGENCE        │
              └──────────┬──────────┘
                         │
                  ┌──────┴──────┐
                  │             │
                  ▼             ▼
             CLEAR CASE     AMBIGUOUS
                  │             │
                  │             ▼
                  │      ┌───────────────┐
                  │      │   AI JUDGE    │
                  │      │               │
                  │      │ Resolution    │
                  │      │ + Challenge   │
                  │      └───────┬───────┘
                  │              │
                  │              ▼
                  │      ┌───────────────┐
                  │      │ EVIDENCE      │
                  │      │ VALIDATION    │
                  │      └───────┬───────┘
                  │              │
                  └──────────────┤
                                 ▼
                       ┌──────────────────┐
                       │ HUMAN AUTHORITY  │
                       │                  │
                       │ Final financial  │
                       │ decision remains │
                       │ with the human   │
                       └──────────────────┘

### The core rule

**Rules establish facts.**

**AI helps reason about ambiguity.**

**Evidence validates AI claims.**

**Humans make the final financial decision.**



# 🎯 Track 04 — AI Finance Controller

ADAPT closes a finance-operations loop across a **100-record synthetic payment and settlement dataset**.

The system focuses on:

- Multi-source reconciliation
- Settlement investigation
- Exception prioritization
- Evidence-driven reasoning
- Selective AI usage
- Human-controlled resolution

The objective is **not** to maximize the number of `MATCHED` transactions.

The objective is:

> **Correctly distinguish financial outcomes and make unresolved exceptions actionable.**


# 📊 Measured Results

ADAPT currently processes:

| Outcome | Count |
|---|---:|
| **MATCHED** | **47** |
| **REVIEW** | **24** |
| **REFUNDED** | **21** |
| **MISMATCH** | **4** |
| **MISSING** | **4** |
| **Total** | **100** |

### Match rate

# **47%**

This is intentional.

A financial reconciliation system should not inflate its match rate by incorrectly auto-matching ambiguous records.

> **Correct differentiation matters more than a vanity match percentage.**



# ⚙️ 1. Deterministic Reconciliation

The financial foundation of ADAPT is deterministic.

The system compares actual financial records using explicit rules rather than asking an LLM to determine whether money matches.

It considers:

- Payment amount
- Settlement amount
- Payment/order references
- Settlement references
- Settlement dates
- Refund lifecycle
- Candidate records
- Ambiguous candidates

Possible outcomes:


MATCHED
REVIEW
MISMATCH
MISSING
REFUNDED


### Why deterministic first?

It makes the financial foundation:

- **Reproducible**
- **Auditable**
- **Testable**
- **Explainable**
- **Independent of LLM behavior**


# 🧭 2. Risk Intelligence

Risk answers:

> **"How urgently should this case be investigated?"**

ADAPT uses an explicit weighted heuristic:

Risk Score =
    30 × amountDiscrepancy
  + 20 × candidateAmbiguity
  + 15 × weakEvidence
  + 10 × dataQuality
  +  5 × temporalInconsistency
  + 15 × decisionSeverity
  +  5 × aiFallback

Classification:


< 30       LOW
30–69      MEDIUM
70+        HIGH
```

These are **domain-reasoned heuristic weights**, not claims of ML-trained calibration.

A production system could calibrate them using:

- Historical financial loss
- Investigation outcomes
- False-positive rates
- False-negative rates

# 🔎 3. Anomaly Intelligence

Anomaly detection answers:

> **"What unusual pattern exists?"**

Signals include:

- Amount discrepancy
- Missing settlement
- Duplicate candidates
- Near-duplicate references
- Temporal inconsistency
- Conflicting evidence
- Incomplete evidence

Signal severity:


HIGH      35
MEDIUM    20
LOW       10


Overall classification:


60+       HIGH
30+       MEDIUM
> 0       LOW
0         NO ANOMALY


Risk and anomaly severity are intentionally independent.

A transaction can therefore be:


LOW RISK + MEDIUM ANOMALY
```

without requiring the highest investigation priority.

# 🧠 4. Selective AI Judge

ADAPT does **not** send every transaction to an LLM.

Clear cases are handled deterministically.

Only ambiguous cases are candidates for AI reasoning.

100 transactions
       │
       ├── Deterministic handling
       │
       ├── Human review
       │
       └── Selected ambiguous cases
                    │
                    ▼
                  AI


### Local AI

```text
Ollama
└── qwen2.5:1.5b

Ollama provides local/offline reasoning during development.

The provider is isolated behind the AI layer so it can be replaced without redesigning the reconciliation system.


# 🔍 5. Investigation Agent

ADAPT moves beyond simply labeling an exception.

The Investigation Agent follows a bounded investigation process:


Exception
   ↓
Search candidates
   ↓
Compare amounts
   ↓
Compare references
   ↓
Compare dates
   ↓
Assess evidence
   ↓
Identify uncertainty
   ↓
Generate recommendation
```

The agent works from **actual financial records**.

It does not fabricate evidence.

An investigation can expose:

- Expected amount
- Candidate settlement amounts
- Amount-match status
- Payment ID
- Order ID
- Settlement ID
- References
- Dates
- Evidence sufficiency
- Remaining risk
- Missing evidence
- Recommended action
- Confidence
- Authority boundary

# 🛡️ 6. AI Safety

AI is treated as a **bounded reasoning component**, not the financial system of record.

ADAPT validates:

- Allowed decision values
- Confidence bounds
- Referenced record IDs
- Candidate membership
- Malformed responses
- Empty responses
- Provider failures
- Timeouts
- Invalid JSON
- Unsupported decisions

### Critical safety rule

> **AI failure cannot create a `MATCHED` financial outcome.**

If AI produces invalid or unsafe output:

```text
AI FAILURE
    ↓
SAFE REVIEW
    ↓
HUMAN INVESTIGATION




# 🔗 7. Evidence Traceability

Investigation claims are tied to actual records.


Expected Amount
      ↓
Payment Record

Candidate Amount
      ↓
Settlement Record

Payment Reference
      ↓
Payment / Order Record

Settlement Reference
      ↓
Settlement Record


The agent does not invent missing evidence.

When evidence is insufficient:


INSUFFICIENT EVIDENCE
        ↓
      REVIEW
        ↓
REQUEST / FIND MISSING EVIDENCE


# 📋 8. Control Plan

An investigation should not end with:

> **"REVIEW."**

ADAPT provides a structured Control Plan.

### Finding
What the system currently knows.

### Evidence
Which actual records support the finding.

### Uncertainty
What remains unresolved.

### Missing Evidence
What information is still required.

### Recommended Action
What the investigator should check next.

### Authority
Whether the system is allowed to act.

The financial boundary is explicit:


RECOMMENDATION ONLY
        ↓
NO AUTOMATIC MUTATION
        ↓
HUMAN APPROVAL REQUIRED


# 👤 9. Human Authority

ADAPT does not give AI unrestricted financial authority.


AI
 ↓
Recommendation
 ↓
Evidence
 ↓
Human Review
 ↓
Financial Authority
```

**AI recommends.**

**Evidence constrains.**

**Humans decide.**



# 📊 10. Dashboard Intelligence

The dashboard is designed as an operational finance command center.

It exposes:

### Reconciliation Health

- Match rate
- Review rate
- Mismatch rate
- Missing settlements
- Refunds

### Reconciliation Outcome

```text
MATCHED
REVIEW
REFUNDED
MISMATCH
MISSING
```

### Audit Intelligence

- Exception exposure
- Exception breakdown
- Risk distribution
- Anomaly distribution
- Resolution priorities
- AI routing metrics

### Architecture Intelligence

```text
Reconciliation
      ↓
Risk + Anomaly
      ↓
AI Judge
      ↓
Investigation Agent
      ↓
Human Authority


# 🧪 Testing

Current verification:


TypeScript
PASS

Tests
180 / 180 PASS

Build
PASS

Verification covers:

- Deterministic reconciliation
- Matching
- Missing settlements
- Mismatches
- Refunds
- Ambiguous candidates
- Duplicate detection
- Near-duplicate references
- Risk scoring
- Anomaly detection
- AI routing
- AI fallback behavior
- Investigation behavior
- Control Plan generation
- Correction flow
- Safety boundaries
- Identifier correctness
- AI output validation



# 🔁 Correction Flow

Human reviewers can correct classifications through structured correction flows.

Examples include:

```text
WRONG_MATCH
FALSE_POSITIVE
MISCLASSIFIED
FEE_MISREAD
SPLIT_OVERLOOKED
DUPLICATE_CONFIRMED_LEGIT
OTHER

Corrections require an explanation.

The system can preserve correction information as structured feedback for future learning workflows.

The original decision remains traceable.


# 📈 Scale Strategy

The demo contains **100 transactions**.

The architecture separates deterministic processing from AI reasoning.

At larger volumes:


Database / Batch Input
        ↓
Indexed Deterministic Reconciliation
        ↓
Risk + Anomaly Processing
        ↓
Queue Ambiguous Cases
        ↓
Selective AI Investigation
        ↓
Human Review

The key scalability principle:

> **10,000 transactions should not require 10,000 LLM calls.**

Production deployment would additionally require:

- Database indexing
- Queue infrastructure
- Concurrency controls
- Load testing
- AI latency benchmarking
- AI cost benchmarking
- Observability
- Production security controls

# 🗂️ Project Structure


app/
├── api/
│   ├── audit/
│   │   └── route.ts
│   ├── reconcile/
│   │   └── route.ts
│   └── review/
│       └── route.ts
│
├── dashboard/
│   └── page.tsx
│
└── page.tsx

components/
├── audit/
│   └── DecisionReplay.tsx
│
├── dashboard/
│   ├── AIPanel.tsx
│   ├── ArchitectureIntelligencePanel.tsx
│   ├── AuditIntelligence.tsx
│   ├── HealthScore.tsx
│   ├── KPICards.tsx
│   ├── ReconciliationOutcomeChart.tsx
│   ├── ReconciliationOverview.tsx
│   ├── ReconciliationPipeline.tsx
│   └── TransactionDrawer.tsx
│
└── learning/
    └── LearnedPattern.tsx

lib/
├── ai/
│   ├── grok.ts
│   └── ollama.ts
│
├── investigation/
│   └── agent.ts
│
├── reconciliation-context.tsx
└── types.ts

tests/
├── api-reconcile.test.ts
└── investigation.test.ts

# 🎬 5-Minute Demo

## 01 — Problem

Start with:

> **"Reconciliation tells you what didn't match. ADAPT helps determine why, what evidence exists, and what should happen next."**


## 02 — Architecture

Show:


Deterministic
      ↓
Risk + Anomaly
      ↓
Selective AI
      ↓
Investigation
      ↓
Evidence Validation
      ↓
Human Authority


Emphasize:

> **AI is not the first step.**



## 03 — Clean Match

Open an exact settlement match.

Show:

- Payment
- Settlement
- Amount
- Evidence
- Decision

Explain that straightforward cases do not require an LLM.



## 04 — Ambiguous Case

Open a `REVIEW` case.

Show:

- Candidate records
- Amount comparison
- Near-duplicate signal
- Evidence
- Uncertainty
- Investigation Agent
- Control Plan
- Recommended action

Key message:

> **ADAPT refuses to turn ambiguity into false certainty.**



## 05 — AI

Show the AI routing and investigation flow.

Explain:

> **AI is used selectively, not indiscriminately.**

The model is a reasoning component, not the financial authority.



## 06 — Safety

Close with:

AI RECOMMENDATION
        ↓
EVIDENCE VALIDATION
        ↓
HUMAN REVIEW
        ↓
FINANCIAL AUTHORITY




# ❓ Judge Questions

### "Why is the match rate only 47%?"

Because ADAPT prioritizes correct classification over maximizing the match percentage.

The dataset intentionally contains:


47 MATCHED
24 REVIEW
21 REFUNDED
4  MISMATCH
4  MISSING


Forcing ambiguous records into `MATCHED` would create a misleading result.



### "Why not send every transaction to AI?"

Because deterministic reconciliation is better suited to clear financial comparisons.

Sending everything to an LLM would increase:

- Cost
- Latency
- Failure surface
- Non-determinism

ADAPT uses:


Deterministic first
        ↓
AI where reasoning helps
        ↓
Human where uncertainty remains



### "Were the risk weights ML-trained?"

No.

They are explicit domain-reasoned heuristics.

They are inspectable and tunable.

Production calibration would use historical financial outcomes.



### "What happens when AI fails?"

The system falls back to:

REVIEW


AI failure cannot create a `MATCHED` result.



### "Why use a local 1.5B model?"

The local Ollama model demonstrates bounded, locally controlled reasoning.

The provider is isolated and replaceable.



### "Can AI change financial records?"

**No.**

The architecture explicitly separates:


Recommendation
      ↓
Evidence
      ↓
Human approval
      ↓
Financial action


### "What happens at 10,000 transactions?"

The deterministic layer handles the majority of records.

Only ambiguous cases need AI investigation.


10,000 transactions
        ↓
Deterministic processing
        ↓
Small ambiguous subset
        ↓
AI investigation
        ↓


# 🏆 Why ADAPT Fits Track 04

The track asks for:

> **Throughput + measured accuracy + an honest exception list.**

ADAPT provides:

### Throughput

**100-record financial batch processed through the reconciliation pipeline.**

### Measured Results

```text
47 MATCHED
24 REVIEW
21 REFUNDED
4  MISMATCH
4  MISSING
```

### Honest Exceptions

Ambiguous transactions remain `REVIEW` rather than being artificially converted into matches.

### AI Judgment

AI is selectively used where ambiguity requires reasoning.

### Evidence

AI recommendations are constrained by actual financial records.

### Failure Recovery

Unsafe or failed AI reasoning falls back to human review.

### Build Quality


TypeScript: PASS
Tests:      180 / 180 PASS
Build:      PASS


### Human Control

**AI does not receive automatic financial authority.**



# 🎯 The Core Idea

Most financial AI systems ask:

> **"Can AI make the decision?"**

ADAPT asks:

> **"Where can AI safely make financial operations better without giving up control?"**


              FACTS
                │
                ▼
        DETERMINISTIC CORE
                │
                ▼
          RISK + ANOMALY
                │
                ▼
          SELECTIVE AI
                │
                ▼
        INVESTIGATION
                │
                ▼
       EVIDENCE VALIDATION
                │
                ▼
        HUMAN AUTHORITY
```

> **ADAPT doesn't replace the financial controller.**
>
> **It gives the financial controller a better investigation system.**

---

# ✅ Status

| Check | Status |
|---|---|
| Deterministic reconciliation | ✅ PASS |
| Risk intelligence | ✅ PASS |
| Anomaly detection | ✅ PASS |
| Selective AI routing | ✅ PASS |
| Investigation Agent | ✅ PASS |
| Evidence traceability | ✅ PASS |
| AI safety / fallback | ✅ PASS |
| Human authority boundary | ✅ PASS |
| TypeScript | ✅ PASS |
| Tests | ✅ 180 / 180 PASS |
| Production build | ✅ PASS |
| Automatic financial mutation by AI | ❌ Not permitted |



# 🧠 ADAPT

### **Deterministic finance controls + selective AI reasoning + evidence-driven investigation + human authority.**

> **AI should increase the capacity of financial teams — not remove their control.**

