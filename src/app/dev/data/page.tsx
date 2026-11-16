import { getProvenance, getSnapshot, getTimeline } from "@/lib/data/store";
import { sourceTypeLabel } from "@/config/sourceTypes";
import { ILLUSTRATIVE_LOCATIONS_NOTE } from "@/config/regions";
import DataBadge from "@/components/common/DataBadge";
import { addDays } from "@/lib/time";
import { countGapDays, daysSinceLastReading } from "@/lib/data/series";
import { NO_DATA_GREY_DAYS } from "@/config/thresholds";
import SourceSparkChart, { type SparkPoint } from "./SourceSparkChart";

/**
 * Developer sanity page for the SIMULATED data (Phase 1).
 * Shows the full timeline, including the future that the demo clock reveals.
 */
export default function DevDataPage() {
  const tl = getTimeline();
  const full = getSnapshot(tl.end);
  const today = getSnapshot(tl.demoDate);
  const provenance = getProvenance();

  return (
    <main className="flex-1 p-4 md:p-6">
      <h1 className="text-xl font-semibold">Dev: simulated data check</h1>
      <p className="mt-1 text-sm text-muted">
        Timeline {tl.start} to {tl.end}. Demo date {tl.demoDate} (dashed line). Data after
        the demo date is hidden from the app until the demo clock reveals it.{" "}
        {ILLUSTRATIVE_LOCATIONS_NOTE}
      </p>

      <ul className="mt-3 flex flex-wrap gap-2 text-xs">
        {provenance.map((p) => (
          <li key={p.id} className="flex items-center gap-1 rounded border border-border bg-panel px-2 py-1">
            <DataBadge provenance={p.provenance} /> {p.title}
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {full.sources.data.map((s) => {
          const values = full.readings.data[s.id].values;
          const rain = full.climate.data.districts[s.district].rainMm;
          const obs = new Map((full.observations.data[s.id] ?? []).map((o) => [o.date, o.levelM]));
          const points: SparkPoint[] = values.map((v, i) => {
            const date = addDays(tl.start, i);
            return { date, level: v, rain: rain[i], obs: obs.get(date) ?? null };
          });
          // Stats as known on the demo date (not including the hidden future).
          const known = today.readings.data[s.id].values;
          const gapDays = countGapDays(known);
          const sinceLast = daysSinceLastReading(known);
          const grey = sinceLast === null || sinceLast > NO_DATA_GREY_DAYS;
          return (
            <section key={s.id} className="rounded-lg border border-border bg-panel p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-medium">
                  {s.id} · {s.name}
                </h2>
                <DataBadge provenance={full.readings.provenance} />
              </div>
              <p className="text-xs text-muted">
                {sourceTypeLabel(s.type, s.region)} · {s.placeLabel} · used by {s.usedBy.join(", ")}
              </p>
              <p className={`text-xs ${grey ? "font-semibold text-red-700" : "text-muted"}`}>
                {gapDays} gap days in the last year · last reading{" "}
                {sinceLast === null ? "never" : sinceLast === 0 ? "today" : `${sinceLast} day${sinceLast === 1 ? "" : "s"} ago`}
                {grey && ` · beyond ${NO_DATA_GREY_DAYS}-day Grey threshold`}
              </p>
              <SourceSparkChart
                points={points}
                failureLevel={s.failureLevelM}
                demoDate={tl.demoDate}
              />
            </section>
          );
        })}
      </div>
    </main>
  );
}
