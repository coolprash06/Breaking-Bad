/**
 * PLACEHOLDER auth layer.
 *
 * The team's existing login page ("Breaking Bad Login Page" project) will be
 * merged in later. Until then, Category 4 pages call these helpers, so the
 * real login only needs to replace this file.
 *
 * The demo session is a browser-only flag (no secrets, no real users).
 */

const DEMO_KEY = "ews.demoSession";

export function startDemoSession(): void {
  try {
    window.localStorage.setItem(DEMO_KEY, "panchayat-demo");
  } catch {
    // Storage blocked (private mode etc.): demo still works for this page view.
  }
}

export function endDemoSession(): void {
  try {
    window.localStorage.removeItem(DEMO_KEY);
  } catch {
    // ignore
  }
}

export function isDemoSession(): boolean {
  try {
    return window.localStorage.getItem(DEMO_KEY) !== null;
  } catch {
    return false;
  }
}
