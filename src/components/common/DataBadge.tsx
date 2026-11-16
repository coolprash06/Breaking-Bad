import type { Provenance } from "@/lib/types";

/** REAL = solid green; SIMULATED = striped amber. Shown wherever data appears. */
export default function DataBadge({
  provenance,
  title,
  className = "",
}: {
  provenance: Provenance;
  title?: string;
  className?: string;
}) {
  const real = provenance === "REAL";
  return (
    <span
      title={title ?? (real ? "Real public data" : "Simulated data (clearly labelled)")}
      className={[
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        real
          ? "bg-emerald-700 text-white"
          : "badge-simulated border border-amber-400 text-amber-900",
        className,
      ].join(" ")}
    >
      {provenance}
    </span>
  );
}
