import type { Provenance } from "@/lib/types";

/** REAL = solid lab-green outline; SIMULATED = striped dashed amber. Shown wherever data appears. */
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
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em]",
        real ? "badge-real" : "badge-simulated",
        className,
      ].join(" ")}
    >
      <span aria-hidden>{real ? "●" : "◌"}</span>
      {provenance}
    </span>
  );
}
