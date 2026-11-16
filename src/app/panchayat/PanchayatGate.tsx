"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { isDemoSession } from "@/lib/auth/session";

const subscribe = () => () => {};

/** Client-side guard stub. Replace with the real login check when merged. */
export default function PanchayatGate({ children }: { children: ReactNode }) {
  // null on the server render, the real value in the browser.
  const allowed = useSyncExternalStore<boolean | null>(
    subscribe,
    isDemoSession,
    () => null,
  );

  if (allowed === null) return null;
  if (!allowed) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-panel p-6 text-sm">
        <p>This dashboard is for Panchayat and officers (Category 4).</p>
        <Link href="/login" className="mt-3 inline-block underline">
          Go to login
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
