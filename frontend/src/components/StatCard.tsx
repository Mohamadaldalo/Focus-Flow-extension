interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  accent?: "blue" | "gold" | "default";
}

const ACCENTS: Record<NonNullable<StatCardProps["accent"]>, string> = {
  blue:    "text-blue",
  gold:    "text-gold",
  default: "text-paper",
};

export function StatCard({ label, value, unit, accent = "default" }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-surface-line bg-surface px-5 py-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-2 font-mono text-3xl tabular-nums ${ACCENTS[accent]}`}>
        {value}
        {unit && <span className="ml-1 text-base text-muted">{unit}</span>}
      </p>
    </div>
  );
}