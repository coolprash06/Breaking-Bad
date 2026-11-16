"use client";

import { useRouter } from "next/navigation";
import { startDemoSession } from "@/lib/auth/session";

export default function TryDemoButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        startDemoSession();
        router.push("/panchayat");
      }}
      className="mt-5 w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90"
    >
      Try demo (Panchayat)
    </button>
  );
}
