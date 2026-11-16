"use client";

/**
 * Simulated basic phone (F6). Shows one persona's inbox, newest first, one SMS at a
 * time like a cheap feature phone. EN / हिंदी on the left soft key, ▲▼ to move,
 * keys 1 / 2 to reply (F9). Delivery is SIMULATED: nothing leaves the browser.
 */
import { useState } from "react";
import type { Persona } from "@/config/personas";
import type { DispatchMessage, FieldReply } from "@/lib/alerts/dispatch";
import type { Lang } from "@/lib/alerts/warnings";
import { smsInfo } from "@/lib/sms/segments";
import { formatShort } from "@/lib/time";

const SENDER = "VM-WLCAST";
const TIER_TAG = { safe: "OK", watch: "WATCH", warning: "WARNING", emergency: "URGENT", nodata: "NO DATA" } as const;

interface Props {
  persona: Persona;
  /** This persona's inbox, newest first. */
  inbox: DispatchMessage[];
  freshIds: ReadonlySet<string>;
  replies: FieldReply[];
  lang: Lang;
  onLang(l: Lang): void;
  onReply(m: DispatchMessage, value: 1 | 2): void;
  /** Start on this message (from the dispatch log). */
  openId: string | null;
}

const KEYS: [string, string][] = [
  ["1", "✉"],
  ["2", "abc"],
  ["3", "def"],
  ["4", "ghi"],
  ["5", "jkl"],
  ["6", "mno"],
  ["7", "pqrs"],
  ["8", "tuv"],
  ["9", "wxyz"],
  ["*", "+"],
  ["0", "␣"],
  ["#", "⇧"],
];

function Bars() {
  return (
    <span className="inline-flex items-end gap-[1.5px]" aria-hidden>
      {[3, 5, 7, 9].map((h, i) => (
        <span key={h} className="w-[2.5px]" style={{ height: h, background: i < 3 ? "var(--lcd-ink)" : "var(--lcd-dim)" }} />
      ))}
    </span>
  );
}

export default function BasicPhone({ persona, inbox, freshIds, replies, lang, onLang, onReply, openId }: Props) {
  const [idx, setIdx] = useState(() => Math.max(0, inbox.findIndex((m) => m.id === openId)));
  const i = Math.min(idx, Math.max(0, inbox.length - 1));
  const msg = inbox[i] ?? null;
  const text = msg ? msg.text[lang] : "";
  const info = smsInfo(text);
  const canReply = !!msg && persona.category !== "manage";
  const reply = msg ? replies.find((r) => r.messageId === msg.id) : undefined;
  const live = canReply && !reply;
  const hi = lang === "hi";

  return (
    <div className="wc-phone mx-auto grid w-[232px] gap-3 px-4 pt-4 pb-5" aria-label={`Simulated basic phone: ${persona.name}`}>
      <div className="grid justify-items-center gap-1" aria-hidden>
        <span className="h-[5px] w-12 rounded-full bg-[#0c0a0b]" />
        <span className="font-mono text-[8.5px] tracking-[0.3em] text-[#8f8189]">WELLCAST · FIELD</span>
      </div>

      {/* Screen */}
      <div className="wc-lcd grid h-[262px] grid-rows-[auto_auto_1fr_auto] overflow-hidden font-mono text-[11px] leading-snug">
        <div className="flex items-center justify-between px-2 pt-1 text-[9.5px]">
          <Bars />
          <span className="dim">{msg ? formatShort(msg.date) : ""} 06:00</span>
          <span aria-hidden>▭</span>
        </div>
        <div className="inv flex items-center justify-between px-2 py-0.5 text-[10px] font-bold tracking-[0.06em]">
          <span>INBOX</span>
          <span>{inbox.length ? `${i + 1}/${inbox.length}` : "0"}</span>
        </div>

        <div className="min-h-0 overflow-y-auto px-2 py-1.5" aria-live="polite">
          {!msg ? (
            <p className="dim pt-6 text-center">
              No messages.
              <br />
              Move the batch clock
              <br />
              to see warnings arrive.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-[9.5px]">
                <span className="font-bold">{SENDER}</span>
                <span className="flex gap-1">
                  {freshIds.has(msg.id) && <span className="inv px-1">NEW</span>}
                  <span className="border border-current px-1">{TIER_TAG[msg.tier]}</span>
                </span>
              </div>
              <hr className="my-1" />
              <p className={hi ? "font-hindi text-[12.5px] leading-[1.45]" : ""} lang={lang}>
                {text}
              </p>
              <hr className="my-1.5" />
              <p className="dim text-[9.5px]" title={`${info.units} ${info.encoding === "GSM-7" ? "GSM-7 characters" : "UCS-2 units"}; limit ${info.perSegment} per SMS at this length`}>
                {info.chars} ch · {info.segments} SMS · {info.encoding} ({info.perSegment}/SMS)
              </p>
              {canReply &&
                (reply ? (
                  <p className="mt-1 text-[10px] font-bold">Reply sent: {reply.value} = {reply.value === 1 ? "water low" : "still fine"}</p>
                ) : (
                  <p className="mt-1 text-[10px]">Reply 1 = water low, 2 = still fine</p>
                ))}
            </>
          )}
        </div>

        <div className="flex justify-between border-t border-dashed border-[var(--lcd-dim)] px-2 py-0.5 text-[10px] font-bold">
          <span className={hi ? "" : "font-hindi"}>{hi ? "ENG" : "हिंदी"}</span>
          <span>{i > 0 ? "Newest" : ""}</span>
        </div>
      </div>

      {/* Soft keys + D-pad */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="grid gap-1.5">
          <button className="wc-key h-6 text-[9px]" onClick={() => onLang(hi ? "en" : "hi")} aria-label={hi ? "Show in English" : "Show in Hindi"}>
            ─
          </button>
          <span className="wc-key grid h-6 place-items-center text-[11px] text-[#3fd17a]" aria-hidden>
            ✆
          </span>
        </div>
        <div className="wc-key grid h-[62px] w-[62px] grid-rows-3 place-items-center rounded-full! p-0 text-[10px]">
          <button className="h-full w-full disabled:opacity-30" disabled={i === 0} onClick={() => setIdx(i - 1)} aria-label="Newer message">
            ▲
          </button>
          <span className="h-3 w-3 rounded-full border border-[#5a4b54]" aria-hidden />
          <button className="h-full w-full disabled:opacity-30" disabled={i >= inbox.length - 1} onClick={() => setIdx(i + 1)} aria-label="Older message">
            ▼
          </button>
        </div>
        <div className="grid gap-1.5">
          <button className="wc-key h-6 text-[9px]" disabled={i === 0} onClick={() => setIdx(0)} aria-label="Newest message">
            ─
          </button>
          <span className="wc-key grid h-6 place-items-center text-[11px] text-[#e8293f]" aria-hidden>
            ✆
          </span>
        </div>
      </div>

      {/* Keypad: 1 and 2 reply; the rest are for looks */}
      <div className="grid grid-cols-3 gap-1.5">
        {KEYS.map(([d, sub]) => {
          const isReply = d === "1" || d === "2";
          const active = isReply && live;
          return (
            <button
              key={d}
              className={`wc-key grid h-8 grid-cols-[auto_auto] items-baseline justify-center gap-1 ${active ? "wc-key-live" : ""}`}
              disabled={!active}
              onClick={() => msg && active && onReply(msg, d === "1" ? 1 : 2)}
              aria-label={active ? `Reply ${d}: ${d === "1" ? "water low" : "still fine"}` : undefined}
              aria-hidden={active ? undefined : true}
              tabIndex={active ? 0 : -1}
            >
              <span className="text-[13px] font-semibold">{d}</span>
              <span className="text-[8px] text-[#9d8f97]">{sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
