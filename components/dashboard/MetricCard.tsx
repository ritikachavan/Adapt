/** Single KPI tile used across dashboards. Purely presentational. */
interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "indigo" | "emerald" | "amber" | "rose" | "sky" | "orange" | "slate";
  loading?: boolean;
}

const TONES: Record<
  NonNullable<MetricCardProps["tone"]>,
  string
> = {
  indigo: "text-indigo-700",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  rose: "text-rose-600",
  sky: "text-sky-600",
  orange: "text-orange-600",
  slate: "text-slate-800",
};

export default function MetricCard({
  label,
  value,
  hint,
  tone = "slate",
  loading = false,
}: MetricCardProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      {loading ? (
        <div
          className="mt-2 h-7 w-16 animate-pulse rounded bg-slate-200"
          aria-label={`Loading ${label}`}
        />
      ) : (
        <p className={`mt-1 text-2xl font-bold tabular-nums ${TONES[tone]}`}>
          {value}
        </p>
      )}
      {hint && !loading && (
        <p className="mt-1 text-xs leading-snug text-slate-500">{hint}</p>
      )}
    </section>
  );
}