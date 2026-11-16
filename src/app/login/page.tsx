import Link from "next/link";
import TryDemoButton from "./TryDemoButton";

/**
 * PLACEHOLDER route. The team's existing login page will be merged here.
 * Do not build a real login form in this project.
 */
export default function LoginPlaceholderPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-panel p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Placeholder
        </p>
        <h1 className="mt-1 text-xl font-semibold">Panchayat / officer login</h1>
        <p className="mt-2 text-sm text-muted">
          The existing login page will be merged into this route. For now,
          judges and the team can enter the Category 4 dashboard with a demo
          session.
        </p>
        <TryDemoButton />
        <Link href="/" className="mt-4 block text-center text-sm underline text-muted">
          Back to main screen
        </Link>
      </div>
    </main>
  );
}
