import PanchayatGate from "./PanchayatGate";

/** F8 Panchayat dashboard. Built in Phase 5; guarded by the placeholder session. */
export default function PanchayatPage() {
  return (
    <main className="flex-1 p-4 md:p-6">
      <PanchayatGate>
        <h1 className="text-xl font-semibold">Panchayat dashboard</h1>
        <p className="mt-2 text-sm text-muted">Coming in Phase 5.</p>
      </PanchayatGate>
    </main>
  );
}
