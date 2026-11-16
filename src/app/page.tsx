import Dashboard from "@/components/dashboard/Dashboard";
import { buildSourcesPayload } from "@/lib/api/sourcesView";
import { buildDispatch } from "@/lib/api/dispatchView";

/**
 * Main screen: header + batch clock, 4 purpose tabs, personas | globe/map | source readout,
 * simulated phone + dispatch log, provenance footer.
 */
export default function Home() {
  const initial = buildSourcesPayload();
  // Warnings already out on demo day (sources at risk before the clock moves).
  const { messages } = buildDispatch(initial.asOf, []);
  return (
    <main className="flex-1">
      <Dashboard initial={initial} initialDispatch={messages} />
    </main>
  );
}
