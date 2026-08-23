# ADAPT — Adaptive AI Finance Controller

AI-assisted financial **reconciliation controller**. Deterministic rules do the bulk of the matching. Only *ambiguous* cases are escalated to a locally-running LLM (Ollama), which must return **confidence + evidence**. Humans review, correct, and those corrections become **memory** that improves future decisions. Everything is auditable, everything is free, everything runs on your machine.

> 🚧 **Status: scaffold only.** This repository currently contains folders and TODO placeholders — no business logic has been implemented yet.

## Workflow

```
Financial Data
  → Deterministic Reconciliation
  → Ambiguous Cases
  → Local AI Judge (Ollama)
  → Confidence + Evidence
  → Human Review
  → Human Correction
  → Correction Memory
  → Future Decisions Use Relevant Corrections
  → Evaluation
  → Audit Trail
```

## Tech Stack

| Concern        | Choice                          |
| -------------- | ------------------------------- |
| Framework      | Next.js (App Router)            |
| Language       | TypeScript                      |
| Styling        | Tailwind CSS                    |
| Database       | SQLite                          |
| ORM            | Prisma                          |
| Local AI       | Ollama (no OpenAI, no paid APIs)|
| Testing        | Vitest                          |

## Project Structure

```
app/                  Next.js pages + API routes (dashboard / review / learning)
components/           UI building blocks (dashboard, review, learning, audit)
lib/                  Core logic: matcher, reconciliation, correction memory, audit, AI provider
  └── ai/             Provider abstraction + Ollama client
scripts/
  └── generate-data.ts  Synthetic data generator (no real financial data, ever)
data/                 Synthetic JSON fixtures (orders, payments, settlements, refunds, ledger, ground truth)
tests/                Vitest unit tests
prisma/               SQLite schema
public/               Static assets
```

## Getting Started

**Prerequisites**

- Node.js 20+
- [Ollama](https://ollama.com) installed locally, with a model pulled:
  ```bash
  ollama pull llama3.1:8b
  ```

**Setup**

```bash
npm install
cp .env.example .env      # then adjust if needed

# after the Prisma schema is defined (not yet):
npx prisma db push

# once scripts/generate-data.ts is implemented (not yet):
npx tsx scripts/generate-data.ts

npm run dev               # http://localhost:3000
```

**Tests**

```bash
npm test                  # vitest run
npm run test:watch
```

## Product Constraints

- Completely free to run — no OpenAI, no paid APIs
- No real financial transactions — synthetic data only
- No vector database, no fine-tuning
- No microservices, no Docker
- Every AI judgment requires confidence + evidence
- Humans stay in the loop; corrections feed future decisions
- Full audit trail for every decision
