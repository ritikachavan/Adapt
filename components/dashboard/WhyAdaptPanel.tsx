export default function WhyAdaptPanel() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="Why ADAPT">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why a Finance Team Would Use ADAPT</h3>
      </div>
      <div className="px-4 py-3 space-y-3">
        {[
          { title: "Reduce manual work", desc: "Automatically resolves straightforward reconciliation cases." },
          { title: "Focus human attention", desc: "Separates ambiguous cases from legitimate outcomes and ranks investigation priority." },
          { title: "Verify AI output", desc: "AI recommendations are checked against source records before they reach the reviewer." },
          { title: "Preserve control", desc: "No automatic financial mutation. Human approval remains authoritative." },
        ].map((item) => (
          <div key={item.title} className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-400" />
            <div>
              <p className="text-[11px] font-semibold text-slate-700">{item.title}</p>
              <p className="text-[11px] leading-relaxed text-slate-500">{item.desc}</p>
            </div>
          </div>
        ))}
        <div className="pt-1 flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">Reconcile</span>
          <span>→</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">Detect</span>
          <span>→</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">Investigate</span>
          <span>→</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">Challenge</span>
          <span>→</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">Validate</span>
          <span>→</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">Adjudicate</span>
          <span>→</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">Decide</span>
        </div>
        <p className="pt-1 text-[10px] leading-relaxed text-slate-400">ADAPT uses expensive AI reasoning only where deterministic reconciliation cannot safely resolve the case.</p>
      </div>
    </section>
  );
}