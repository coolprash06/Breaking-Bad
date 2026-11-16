import Dashboard from "@/components/dashboard/Dashboard";
import { buildSourcesPayload } from "@/lib/api/sourcesView";

/** Main screen: header + batch clock, 4 purpose tabs, personas | globe/map | source readout, provenance footer. */
export default function Home() {
  return (
    <main className="flex-1">
      <Dashboard initial={buildSourcesPayload()} />
    </main>
  );
}
