import { buildDispatch } from "@/lib/api/dispatchView";

/**
 * Batch dispatch (SIMULATED delivery). Body: { asOf, sent: ["TH-09|warning", ...] }.
 * Returns the new warnings the engine sends on that date. Stateless: the client
 * keeps the list of keys already sent, so Reset simply forgets them.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON: { asOf, sent }" }, { status: 400 });
  }
  const { asOf, sent } = (body ?? {}) as { asOf?: unknown; sent?: unknown };
  if (typeof asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return Response.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
  }
  const keys = Array.isArray(sent) ? sent.filter((k): k is string => typeof k === "string" && k.length < 64).slice(0, 500) : [];
  return Response.json(buildDispatch(asOf, keys));
}
