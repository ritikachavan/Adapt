# 🧠 ADAPT

## AI Finance Controller

**Reconcile. Investigate. Explain. Keep humans in control.**

ADAPT is an AI-assisted financial reconciliation and exception-management system designed for payment and settlement operations.

Instead of sending every transaction to an LLM, ADAPT uses a **deterministic-first architecture**:

> **Reconcile deterministically → detect risk → detect anomalies → selectively use AI → investigate with evidence → keep the human in control**

The result is a finance workflow where AI adds reasoning without becoming an uncontrolled financial decision-maker.

---

## 🎯 Why ADAPT?

Traditional reconciliation systems are good at answering:

> **"Do these records match?"**

Real finance operations need to answer harder questions:

* Why didn't this transaction reconcile?
* Is this a duplicate or a legitimate second transaction?
* Which settlement record is actually relevant?
* What evidence supports the conclusion?
* What information is still missing?
* What should an investigator do next?
* When should AI be involved?
* When should the system stop and require a human?

**ADAPT is built around those questions.**

---

# 🏗️ The ADAPT Decision Pipeline

```text
                    ┌─────────────────────┐
                    │     TRANSACTIONS    │
                    └──────────┬──────────┘
                               │
                               ▼
              ┌────────────────────────────┐
              │  DETERMINISTIC RECONCILER  │
              │                            │
              │ amount • reference • date │
              │ settlement • lifecycle    │
              └─────────────┬──────────────┘
                            │
               ┌────────────┴────────────┐
               │                         │
               ▼                         ▼
          CONFIDENT                  EXCEPTION
          OUTCOME                    DETECTED
               │                         │
               │                         ▼
               │              ┌────────────────────┐
               │              │ RISK + ANOMALY     │
               │              │ INTELLIGENCE       │
               │              └─────────┬──────────┘
               │                        │
               │              ┌─────────┴─────────┐
               │              │                   │
               │              ▼                   ▼
               │          LOW / SAFE        AMBIGUOUS
               │                                  │
               │                                  ▼
               │                       ┌──────────────────┐
               │                       │     AI JUDGE     │
               │                       │                  │
               │                       │ Selective LLM    │
               │                       │ reasoning        │
               │                       └────────┬─────────┘
               │                                │
               │                                ▼
               │                    ┌─────────────────────┐
               │                    │ INVESTIGATION AGENT │
               │                    │                     │
               │                    │ Search → Compare    │
               │                    │ → Assess → Explain  │
               │                    └──────────┬──────────┘
               │                               │
               └───────────────────────────────┤
                                               ▼
                                  ┌────────────────────────┐
                                  │    HUMAN AUTHORITY     │
                                  │                        │
                                  │ Final financial        │
                                  │ decision remains human │
                                  └────────────────────────┘
```

### The architectural principle

**Rules establish facts.**

**AI helps reason about ambiguity.**

**Agents investigate evidence.**

**Humans retain financial authority.**

---

# ⚙️ 1. Deterministic Reconciliation

The first layer does not ask an LLM to decide whether money matches.

It compares actual financial records using deterministic logic.

Examples include:

* Expected payment amount
* Settlement amount
* Payment/order reference
* Settlement reference
* Settlement dates
* Refund lifecycle
* Candidate records

Possible outcomes:

```text
MATCHED
REVIEW
MISMATCH
MISSING
REFUNDED
```

This makes the financial foundation:

* deterministic
* reproducible
* auditable
* testable

---

# 📊 2. Risk Intelligence

ADAPT separates **risk** from anomaly detection.

Risk answers:

> **"How urgently should this case be investigated?"**

The current risk model is an explicit weighted heuristic:

```text
Risk Score =
    30 × amountDiscrepancy
  + 20 × candidateAmbiguity
  + 15 × weakEvidence
  + 10 × dataQuality
  +  5 × temporalInconsistency
  + 15 × decisionSeverity
  +  5 × aiFallback
```

Classification:

```text
< 30       LOW
30 – 69    MEDIUM
70+        HIGH
```

These are **domain-reasoned heuristic weights**, not claims of ML-trained calibration.

In production, the weights could be calibrated against historical financial loss, investigation outcomes, and false-positive/false-negative rates.

---

# 🔎 3. Anomaly Intelligence

Anomaly detection answers:

> **"What unusual pattern exists?"**

Signals can include:

* Amount discrepancy
* Missing settlement
* Duplicate candidate
* Near-duplicate reference
* Temporal inconsistency
* Conflicting evidence
* Incomplete evidence

Signal severity contributes:

```text
HIGH      35
MEDIUM    20
LOW       10
```

Overall classification:

```text
60+       HIGH
30+       MEDIUM
> 0       LOW
0         No anomaly
```

Risk and anomaly severity are intentionally independent.

A transaction can therefore be:

```text
LOW risk + MEDIUM anomaly
```

because the pattern is unusual without necessarily requiring the highest investigation urgency.

---

# 🧠 4. Selective AI Judge

ADAPT does **not** send every transaction to an LLM.

The deterministic system handles clear cases first.

Only ambiguous cases are candidates for AI reasoning.

Example routing:

```text
100 transactions
       │
       ├── 20 → human review / deterministic ambiguity
       │
       ├── 76 → deterministic handling
       │
       └── 4  → AI Judge
                  │
                  └── 4 successful
                      0 fallback
```

The AI layer is currently powered by:

```text
Ollama
└── qwen2.5:1.5b
```

The provider is isolated behind the AI layer so a production deployment can replace the underlying model/provider without redesigning the reconciliation architecture.

### Why local AI?

Ollama provides local/offline reasoning during development.

This keeps the AI layer:

* isolated
* replaceable
* controllable
* easy to demonstrate without external API dependency

---

# 🔍 5. Investigation Agent

This is where ADAPT moves beyond simple classification.

The Investigation Agent follows a bounded investigation sequence:

```text
1. Exception received
        ↓
2. Settlement candidates searched
        ↓
3. Amounts compared
        ↓
4. References compared
        ↓
5. Dates compared
        ↓
6. Evidence assessed
        ↓
7. Recommendation generated
```

The agent works from **actual records**, not fabricated evidence.

For each investigation it can expose:

* expected amount
* candidate settlement amounts
* amount-match status
* payment reference
* settlement reference
* dates
* evidence sufficiency
* remaining risk
* missing evidence
* recommended action
* confidence
* authority boundary

---

# 🛡️ 6. Control Plan

An investigation should not end with:

> "REVIEW."

ADAPT explains what happens next.

A Control Plan can identify:

### Finding

What the system currently knows.

### Evidence

Which actual records support the finding.

### Uncertainty

What remains unresolved.

### Missing Evidence

What information is still needed.

### Recommended Action

What the investigator should check next.

### Authority

Whether the system is allowed to act.

The financial boundary remains explicit:

```text
RECOMMENDATION ONLY
        ↓
NO AUTOMATIC MUTATION
        ↓
HUMAN APPROVAL REQUIRED
```

---

# 📊 7. Dashboard Intelligence

The dashboard is designed as an operational command center rather than a collection of raw tables.

It exposes:

### Reconciliation Health

* Match rate
* Review rate
* Mismatch rate
* Missing settlements
* Refunds

### Reconciliation Outcome

A visual distribution of:

```text
MATCHED
REVIEW
REFUNDED
MISMATCH
MISSING
```

### Audit Intelligence

* Exception exposure
* Exception breakdown
* Risk distribution
* Anomaly distribution
* Resolution priorities
* AI routing metrics

### Architecture Intelligence

**How ADAPT Decides**

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
```

The dashboard exposes the actual risk formula, anomaly thresholds, AI routing metrics, and safety boundary.

---

# 📈 Why the 47% Match Rate Is Intentional

ADAPT is not designed to maximize the percentage of transactions labeled `MATCHED`.

The dataset contains multiple legitimate outcomes:

```text
47  MATCHED
24  REVIEW
21  REFUNDED
4   MISMATCH
4   MISSING
```

The important objective is **correct differentiation**, not forcing exceptions into a successful-match bucket.

A reconciliation engine that incorrectly auto-matches ambiguous financial records can be more dangerous than one that sends them to review.

---

# 🛡️ Safety Architecture

ADAPT follows a strict authority boundary.

```text
                 AI
                  │
                  ▼
          Recommendation
                  │
                  ▼
            Human Review
                  │
                  ▼
       Financial Authority
```

The AI and Investigation Agent do not receive unrestricted authority to mutate financial records.

The system is designed so that:

* deterministic reconciliation establishes financial facts
* AI provides structured reasoning
* the Investigation Agent gathers evidence
* ambiguous cases remain reviewable
* humans retain final financial authority

---

# 🔗 Evidence Traceability

Investigation claims are tied to actual records.

For example:

```text
Expected Amount
      ↓
Payment Record

Candidate Amount
      ↓
Settlement Record

Payment Reference
      ↓
Order / Payment Record

Settlement Reference
      ↓
Settlement Record
```

The agent does not invent missing evidence.

When evidence is insufficient:

```text
INSUFFICIENT
      ↓
REVIEW
      ↓
REQUEST / FIND MISSING EVIDENCE
```

---

# 🧪 Testing

Current verification:

```text
142 / 142 tests passing
Typecheck: PASS
Build: PASS
15 routes generated
```

Investigation coverage includes:

* strong matching cases
* ambiguous cases
* missing evidence
* multiple settlement candidates
* amount mismatches
* Control Plan generation
* safety boundaries
* terminology consistency
* hard-coded transaction protection

The Investigation Agent was verified to operate from `transactionId` and actual records rather than special-casing demo transactions.

---

# 🚀 Scale Strategy

The demo dataset contains 100 transactions.

The architecture is designed so deterministic processing and AI reasoning scale independently.

At larger volumes:

```text
Database / Batch Input
        ↓
Indexed deterministic reconciliation
        ↓
Parallel risk + anomaly processing
        ↓
Queue ambiguous cases
        ↓
Selective AI investigation
        ↓
Human review queue
```

The key scalability principle is:

> **10,000 transactions should not require 10,000 LLM calls.**

The current demo establishes the architecture and behavior. Production deployment would require dedicated load testing, database indexing, queueing, concurrency controls, and AI latency/cost benchmarking.

---

# 🗂️ Project Structure

```text
app/
├── api/
│   ├── investigate/
│   │   └── route.ts
│   └── reconcile/
│       └── route.ts
│
└── dashboard/
    └── page.tsx

components/
└── dashboard/
    ├── ArchitectureIntelligencePanel.tsx
    ├── AuditIntelligence.tsx
    ├── DashboardReviewQueue.tsx
    ├── KPICards.tsx
    ├── ReconciliationOutcomeChart.tsx
    ├── TransactionDrawer.tsx
    └── TransactionTable.tsx

lib/
├── investigation/
│   └── agent.ts
├── risk/
│   ├── anomalyDetection.ts
│   └── riskScoring.ts
├── resolution/
│   └── resolutionRecommendations.ts
├── matcher.ts
└── ...

tests/
├── investigation.test.ts
├── anomaly-detection.test.ts
├── risk-scoring.test.ts
└── ...
```

---

# 🎬 Demo Flow

A concise 5-minute demonstration:

### 01 — Start with the problem

Financial reconciliation tells you **what doesn't match**.

ADAPT helps determine **why, what evidence exists, and what should happen next**.

### 02 — Show the architecture

```text
Deterministic
      ↓
Risk + Anomaly
      ↓
Selective AI
      ↓
Investigation Agent
      ↓
Human Authority
```

### 03 — Show a clean case

Demonstrate an exact settlement match.

Show:

* amount
* settlement candidate
* evidence
* recommendation

### 04 — Show an ambiguous case

Demonstrate:

* multiple candidates
* duplicate/near-duplicate signals
* evidence comparison
* uncertainty
* Control Plan
* human review

### 05 — Show AI routing

Point to:

```text
Escalated
Success
Fallback
Skipped
```

The key message:

> **AI is used selectively, not indiscriminately.**

### 06 — Close on safety

```text
Recommendation only
        ↓
No automatic mutation
        ↓
Human approval required
```

---

# ❓ Judge Questions

### "Why is the match rate only 47%?"

Because the dataset contains deliberately differentiated outcomes including refunds, ambiguous reviews, mismatches, and missing settlements.

ADAPT prioritizes **correct classification over maximizing auto-match rate**.

### "Were the risk weights ML-trained?"

No.

They are explicit domain-reasoned heuristics designed to be inspectable and tunable. Production calibration would use historical financial outcomes and investigation data.

### "What happens at 10,000 transactions?"

The deterministic layer scales independently from the AI layer. Ambiguous cases can be queued and selectively sent to the AI Judge instead of making an LLM call for every transaction.

### "Why use a 1.5B local model?"

It demonstrates bounded, local reasoning without making the LLM the financial authority. The AI layer is provider-agnostic and can be replaced with a production model.

### "Can the AI change financial records?"

No.

The architecture explicitly separates recommendation from financial authority.

---

# 🎯 The Core Idea

Most financial AI systems ask:

> **"Can AI make the decision?"**

ADAPT asks a different question:

> **"Where can AI safely make financial operations better without giving up control?"**

The answer is:

```text
              FACTS
                │
                ▼
        DETERMINISTIC CORE
                │
                ▼
          INTELLIGENCE
        ┌───────┴───────┐
        │               │
       RISK          ANOMALY
        │               │
        └───────┬───────┘
                ▼
          SELECTIVE AI
                │
                ▼
       EVIDENCE-DRIVEN
        INVESTIGATION
                │
                ▼
        HUMAN AUTHORITY
```

**ADAPT doesn't replace the financial controller.**

**It gives the financial controller a better investigation system.**

---

# ✅ Status

| Check                                       | Status           |
| ------------------------------------------- | ---------------- |
| Build                                       | ✅ PASS           |
| Typecheck                                   | ✅ PASS           |
| Tests                                       | ✅ 142 / 142 PASS |
| Routes                                      | ✅ 15             |
| Financial mutation introduced by AI         | ✅ No             |
| Automatic financial authority granted to AI | ✅ No             |

## 🧠 ADAPT

**Deterministic finance controls + selective AI reasoning + evidence-driven investigation + human authority.**
