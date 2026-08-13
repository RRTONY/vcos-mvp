interface StatBoxProps {
  value: string | number;
  label: string;
  sub?: string;
  shade?: "black" | "gray" | "light";
  loading?: boolean;
}

export default function StatBox({
  value,
  label,
  sub,
  shade = "black",
  loading,
}: StatBoxProps) {
  const valueColor =
    shade === "black"
      ? "text-ink"
      : shade === "gray"
        ? "text-ink3"
        : "text-ink4";

  return (
    <div className="bg-sand border border-sand3 p-4 flex flex-col gap-1">
      <div
        className={`font-serif font-black text-3xl leading-none ${valueColor} ${loading ? "animate-pulse" : ""}`}
      >
        {loading ? "-" : value}
      </div>
      <div className="text-xs font-bold uppercase tracking-widest text-ink3">
        {label}
      </div>
      {sub && <div className="text-xs text-ink4 font-medium">{sub}</div>}
    </div>
  );
}
