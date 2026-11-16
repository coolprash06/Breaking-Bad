import type { NextRequest } from "next/server";
import { buildSourcesPayload } from "@/lib/api/sourcesView";

/** All sources with their current risk status as of the demo clock date. */
export async function GET(req: NextRequest) {
  return Response.json(buildSourcesPayload(req.nextUrl.searchParams.get("asOf")));
}
