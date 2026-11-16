"use client";

import { PERSONAS } from "@/config/personas";
import type { DispatchMessage, FieldReply } from "@/lib/alerts/dispatch";
import { formatShort } from "@/lib/time";
import DataBadge from "@/components/common/DataBadge";
import { RISK_UI, RiskIcon } from "@/components/map/RiskMarker";

const personaName = (id: string) => PERSONAS.find((p) => p.id === id)?.name ?? id;

type Row = { kind: "msg"; m: DispatchMessage } | { kind: "reply"; r: FieldReply };

interface Props {
  messages: DispatchMessage[];
  replies: FieldReply[];
  freshIds: ReadonlySet<string>;
  demoDate: string;
  onOpen(m: DispatchMessage): void;
}

/** Every warning the engine has "sent" (newest first), plus replies from the field. SIMULATED delivery. */
export default function DispatchLog({ messages, replies, freshIds, demoDate, onOpen }: Props) {
  // Newest batch first; within a batch keep the engine's order (source, then persona).
  const rows: Row[] = [
    ...replies.map((r) => ({ kind: "reply" as const, r })),
    ...messages.map((m) => ({ kind: "msg" as const, m })),
  ].sort((a, b) => {
    const da = a.kind === "msg" ? a.m.date : a.r.date;
    const db = b.kind === "msg" ? b.m.date : b.r.date;
    if (da !== db) return da < db ? 1 : -1;
    return a.kind === b.kind ? 0 : a.kind === "reply" ? -1 : 1;
  });
  const people = messages.reduce((a, m) => a + (m.recipients.unit === "households" ? m.recipients.count : 0), 0);

  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted">
        <DataBadge provenance="SIMULATED" title="No SMS is really sent: delivery is simulated in the demo" />
        <span>
          {messages.length} SMS groups · {new Set(messages.map((m) => m.key)).size} alerts · {people} households reached · {replies.length} field
          {replies.length === 1 ? " reply" : " replies"}
        </span>
      </div>
      <div className="wc-card max-h-[430px] overflow-y-auto" role="list" aria-label="Dispatch log">
        {rows.length === 0 && <p className="p-3 font-mono text-[12px] text-muted">Nothing sent yet. Move the batch clock forward.</p>}
        {rows.map((row) =>
          row.kind === "reply" ? (
            <div
              key={row.r.id}
              role="listitem"
              className="grid grid-cols-[52px_1fr] gap-2 border-b border-border px-3 py-2 font-mono text-[11.5px] wc-fresh"
            >
              <time className="text-faint">{formatShort(row.r.date)}</time>
              <span>
                <span className="text-lab">← FIELD REPORT</span> · {personaName(row.r.personaId)} at {row.r.sourceName}: replied {row.r.value} ={" "}
                <b>{row.r.value === 1 ? "water low" : "still fine"}</b>
              </span>
            </div>
          ) : (
            <button
              key={row.m.id}
              role="listitem"
              onClick={() => onOpen(row.m)}
              title="Open on the phone"
              className={`grid w-full grid-cols-[52px_16px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-1.5 text-left font-mono text-[11.5px] hover:bg-panel2 ${freshIds.has(row.m.id) ? "wc-fresh" : ""}`}
            >
              <time className="text-faint">{formatShort(row.m.date)}</time>
              <RiskIcon tier={row.m.tier} size={13} />
              <span className="min-w-0 truncate">
                <span className="font-semibold">{row.m.sourceName}</span>
                <span className="text-muted"> {RISK_UI[row.m.tier].label} → </span>
                {personaName(row.m.personaId)}
                <span className="text-muted">
                  {" "}
                  · {row.m.recipients.count.toLocaleString("en-IN")} {row.m.recipients.unit}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                {freshIds.has(row.m.id) && <span className="rounded bg-lab px-1 text-[9.5px] font-bold text-[var(--bg0)]">NEW</span>}
                {row.m.date === demoDate && <span className="text-[10px] text-faint">demo day</span>}
                <span className="rounded border border-line2 px-1 text-[10px]">{row.m.lang === "hi" ? "HI" : "EN"}</span>
              </span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}
