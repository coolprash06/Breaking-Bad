import type { ProvenanceEntry } from "@/lib/data/store";
import type { RealView } from "@/lib/real/view";
import DataBadge from "@/components/common/DataBadge";

/** Data provenance (REAL / SIMULATED) and credits. Licences checked 16 Nov 2026; see public/geo/README.md and data/real/README.md. */
export default function ProvenanceFooter({ provenance, real = null }: { provenance: ProvenanceEntry[]; real?: RealView | null }) {
  return (
    <footer className="grid gap-2 border-t border-border px-4 py-3 font-mono text-[11.5px] leading-snug text-muted sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="wc-label">
          Provenance <em>· Real vs simulated</em>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <DataBadge provenance="REAL" /> Boundaries (Survey of India via DataMeet)
        </span>
        {real?.gwra && (
          <span className="inline-flex items-center gap-1.5" title={`${real.gwra.title}. ${real.gwra.publisher}.`}>
            <DataBadge provenance="REAL" /> District groundwater &amp; block categories (CGWB 2025)
          </span>
        )}
        {real?.wells && (
          <span className="inline-flex items-center gap-1.5" title={`${real.wells.title}. ${real.wells.publisher}.`}>
            <DataBadge provenance="REAL" /> Reference wells (CGWB)
          </span>
        )}
        {provenance.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5" title={`${p.source}. ${p.note}`}>
            <DataBadge provenance={p.provenance} /> {p.title}
          </span>
        ))}
      </div>
      <p>
        Daily levels of individual village sources, their usage and the sensor network are simulated: no public daily data exists
        for them. They are driven by real rainfall and evaporation and by each district&apos;s real groundwater balance.
      </p>
      {real && (
        <p>
          Groundwater:{" "}
          {real.gwra && (
            <>
              <a className="underline" href={real.gwra.url} target="_blank" rel="noreferrer">
                National Compilation on Dynamic Ground Water Resources of India, 2025
              </a>{" "}
              (CGWB, Ministry of Jal Shakti, Government of India; retrieved {real.gwra.retrieved}).{" "}
            </>
          )}
          {real.wells && (
            <>
              Observation wells: CGWB via India-WRIS, from the{" "}
              <a className="underline" href={real.wells.url} target="_blank" rel="noreferrer">
                India Data Portal
              </a>{" "}
              (retrieved {real.wells.retrieved}).{" "}
            </>
          )}
          {real.climate && (
            <>
              Weather:{" "}
              <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                Open-Meteo
              </a>{" "}
              (CC BY 4.0), ERA5 reanalysis by Copernicus Climate Change Service / ECMWF. Block towns geocoded with GeoNames (CC BY 4.0).
            </>
          )}
        </p>
      )}
      <p>
        India boundary:{" "}
        <a className="underline" href="https://github.com/datameet/maps/blob/master/Country/india-soi.geojson" target="_blank" rel="noreferrer">
          india-soi.geojson
        </a>{" "}
        by{" "}
        <a className="underline" href="http://datameet.org/" target="_blank" rel="noreferrer">
          DataMeet India community
        </a>{" "}
        (Census 2011 / Survey of India), CC BY-SA 2.5 / ODbL; simplified by us and shared under the same terms. State lines:{" "}
        <a className="underline" href="https://github.com/datameet/maps/tree/master/Survey-of-India-Index-Maps/Boundaries" target="_blank" rel="noreferrer">
          India-States
        </a>{" "}
        by DataMeet, CC BY 4.0. World land: Natural Earth (public domain). Source locations are illustrative.
      </p>
    </footer>
  );
}
