import Link from "next/link";

/** Main screen: 4 purpose tabs + shared map + persona panel (built in Phase 3). */
export default function Home() {
  return (
    <main className="flex-1 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Water Early Warning: Thar &amp; Kutch</h1>
          <p className="text-sm text-muted">
            A weather forecast for wells: warn people weeks before their water runs out.
          </p>
        </div>
        <Link href="/login" className="rounded-lg border border-border px-3 py-1.5 text-sm">
          Panchayat login
        </Link>
      </header>
      <p className="mt-8 text-sm text-muted">Main screen arrives in Phase 3.</p>
    </main>
  );
}
