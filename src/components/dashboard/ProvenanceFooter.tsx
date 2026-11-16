import type { ProvenanceEntry } from "@/lib/data/store";
import DataBadge from "@/components/common/DataBadge";

/** Data provenance (REAL / SIMULATED) and credits. Licences checked 16 Nov 2026; see public/geo/README.md. */
export default function ProvenanceFooter({ provenance }: { provenance: ProvenanceEntry[] }) {
  return (
    <footer className="grid gap-2 border-t border-border px-4 py-3 font-mono text-[11.5px] leading-snug text-muted sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="wc-label">
          Provenance <em>· Real vs simulated</em>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <DataBadge provenance="REAL" /> Boundaries (Survey of India via DataMeet)
        </span>
        {provenance.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5" title={`${p.source}. ${p.note}`}>
            <DataBadge provenance={p.provenance} /> {p.title}
          </span>
        ))}
      </div>
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
