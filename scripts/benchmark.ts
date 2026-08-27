/**
 * ADAPT — Benchmark & Evaluation Script.
 * Runs actual deterministic reconciliation, measures throughput,
 * evaluates accuracy against ground truth. No fabrication.
 * Run: npx tsx scripts/benchmark.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type { FinancialDataBundle } from "../lib/types";
import { reconcile } from "../lib/reconciliation";
import { evaluateReconciliation, type GroundTruthCase } from "../lib/evaluation";

async function loadJsonArray(fileName: string, dir: string): Promise<unknown[]> {
  const raw = await readFile(path.join(dir, fileName), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${fileName}: expected JSON array`);
  return parsed;
}

async function loadBundle(dir: string): Promise<FinancialDataBundle> {
  const [orders, payments, settlements, refunds, ledger] = await Promise.all([
    loadJsonArray("orders.json", dir), loadJsonArray("payments.json", dir),
    loadJsonArray("settlements.json", dir), loadJsonArray("refunds.json", dir),
    loadJsonArray("ledger.json", dir),
  ]);
  return { orders, payments, settlements, refunds, ledger } as FinancialDataBundle;
}

function replicateBundle(b: FinancialDataBundle, factor: number): FinancialDataBundle {
  const orders = [], payments = [], settlements = [], refunds = [], ledger = [];
  for (let i = 0; i < factor; i++) {
    const pfx = `r${i}_`;
    for (const o of b.orders) orders.push({ ...o, id: pfx + o.id });
    for (const x of b.payments) payments.push({ ...x, id: pfx + x.id, orderId: pfx + x.orderId });
    for (const s of b.settlements) settlements.push({ ...s, id: pfx + s.id, paymentId: pfx + s.paymentId });
    for (const r of b.refunds) refunds.push({ ...r, id: pfx + r.id, paymentId: pfx + r.paymentId });
    for (const l of b.ledger) ledger.push({ ...l, id: pfx + l.id, referenceId: pfx + l.referenceId });
  }
  return { orders, payments, settlements, refunds, ledger } as FinancialDataBundle;
}

function runBenchmark(bundle: FinancialDataBundle, label: string, iterations: number): void {
  reconcile(bundle); // warm up
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    reconcile(bundle);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const records = bundle.payments.length;
  const rps = Math.round(records / (median / 1000));
  console.log(`  ${label.padEnd(14)} ${String(records).padStart(6)} records    ${median.toFixed(1).padStart(8)} ms    ${String(rps).padStart(8)} records/sec`);
}

async function main() {
  const dataDir = path.join(import.meta.dirname, "..", "data");
  const bundle = await loadBundle(dataDir);
  const groundTruth: GroundTruthCase[] = JSON.parse(await readFile(path.join(dataDir, "ground-truth.json"), "utf8"));

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ADAPT — Deterministic Engine Benchmark & Evaluation");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("THROUGHPUT (median of 10 iterations)");
  console.log("─────────────────────────────────────────────────────────");
  runBenchmark(bundle, "100 records", 10);
  runBenchmark(replicateBundle(bundle, 10), "1,000 records", 10);
  runBenchmark(replicateBundle(bundle, 100), "10,000 records", 10);
  console.log("\n  Local benchmark. Production throughput depends on");
  console.log("  database, I/O, deployment architecture, and concurrency.\n");

  const report = reconcile(bundle);
  const s = report.summary;
  console.log("RECONCILIATION OUTCOME");
  console.log("─────────────────────────────────────────────────────────");
  console.log(`  MATCHED:   ${s.byDecision.MATCHED}`);
  console.log(`  REVIEW:    ${s.byDecision.REVIEW}`);
  console.log(`  REFUNDED:  ${s.byDecision.REFUNDED}`);
  console.log(`  MISMATCH:  ${s.byDecision.MISMATCH}`);
  console.log(`  MISSING:   ${s.byDecision.MISSING}`);
  const sum = s.byDecision.MATCHED + s.byDecision.REVIEW + s.byDecision.REFUNDED + s.byDecision.MISMATCH + s.byDecision.MISSING;
  console.log(`  TOTAL:     ${s.total}  (sum check: ${sum === s.total ? "PASS" : "FAIL"})\n`);

  const evalReport = evaluateReconciliation({ groundTruth, decisions: report.decisions });
  const t = evalReport.totals;
  console.log("GROUND-TRUTH EVALUATION");
  console.log("─────────────────────────────────────────────────────────");
  console.log(`  Evaluated:       ${t.totalCases}`);
  console.log(`  Correct:         ${t.correctDecisions}`);
  console.log(`  Errors:          ${t.incorrectDecisions}`);
  console.log(`  Accuracy:        ${(t.accuracy * 100).toFixed(1)}%`);
  console.log(`  Precision:       ${(t.precision * 100).toFixed(1)}%`);
  console.log(`  Recall:          ${(t.recall * 100).toFixed(1)}%`);
  console.log(`  Unmatched:       ${t.unmatchedTransactionCount}`);
  if (evalReport.errors.length > 0) {
    console.log(`\n  Errors:`);
    for (const e of evalReport.errors) {
      console.log(`    ${e.transactionId}: expected ${e.expectedDecision}, got ${e.actualDecision} [${e.scenario}]`);
    }
  }
  console.log();

  let riskHigh = 0, riskMed = 0, riskLow = 0;
  for (const d of report.decisions) {
    if (d.risk?.level === "HIGH") riskHigh++;
    else if (d.risk?.level === "MEDIUM") riskMed++;
    else if (d.risk) riskLow++;
  }
  console.log("RISK DISTRIBUTION");
  console.log("─────────────────────────────────────────────────────────");
  console.log(`  HIGH: ${riskHigh}  MEDIUM: ${riskMed}  LOW: ${riskLow}  TOTAL: ${riskHigh + riskMed + riskLow}\n`);

  let anomHigh = 0, anomMed = 0, anomLow = 0, anomTotal = 0;
  for (const d of report.decisions) {
    if (d.anomaly?.isAnomalous && d.anomaly.severity) {
      anomTotal++;
      if (d.anomaly.severity === "HIGH") anomHigh++;
      else if (d.anomaly.severity === "MEDIUM") anomMed++;
      else anomLow++;
    }
  }
  console.log("ANOMALY DISTRIBUTION");
  console.log("─────────────────────────────────────────────────────────");
  console.log(`  HIGH: ${anomHigh}  MEDIUM: ${anomMed}  LOW: ${anomLow}  TOTAL: ${anomTotal} / ${s.total}\n`);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  All values measured. No fabrication.");
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((e) => { console.error(e); process.exit(1); });

