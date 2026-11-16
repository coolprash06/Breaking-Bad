"use client";

import { useSyncExternalStore } from "react";

/** "dark" | "light": the theme actually showing (saved choice, else system setting). */
function current(): "dark" | "light" {
  const t = document.documentElement.dataset.theme;
  if (t === "dark" || t === "light") return t;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function subscribe(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
}

export function useThemeKey(): "dark" | "light" {
  return useSyncExternalStore(subscribe, current, () => "dark");
}

export function setTheme(t: "dark" | "light"): void {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("wellcast-theme", t);
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }
}
