"use client";
import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Mode } from "./types";

// URL holds only what defines "what you're looking at" — linkable, back-button-able.
// Transient hover stays out of the URL. The whole app is one page: "stories" is a
// third view toggle, and `story` selects an article within it.
export type View = "measure" | "snapshot" | "stories" | "about";

export interface AppState {
  view: View; // "measure" = by-measure atlas, "snapshot" = by-place, "stories" = essays
  metric: string;
  mode: Mode;
  region: string; // "us" | census region | state abbr
  selected?: string; // selected ZIP
  story?: string; // selected story slug (stories view)
}

export const DEFAULTS: AppState = {
  view: "snapshot",
  metric: "diabetes",
  mode: "gap",
  region: "us",
};

const MODES: Mode[] = ["rate", "gap", "percentile"];
const VIEWS: View[] = ["measure", "snapshot", "stories", "about"];

export function decode(sp: URLSearchParams): AppState {
  const mode = sp.get("mode");
  let view = sp.get("view");
  let story = sp.get("story") || undefined;
  // legacy section params from the previous ?p= routing — keep old shared links working
  const p = sp.get("p");
  if (p === "story") {
    view = "stories";
    story = sp.get("s") || story;
  } else if (p === "stories") {
    view = "stories";
  } else if (p === "methods" || p === "sources") {
    // methods/sources used to be their own routes, then in-page accordions; both now live
    // under About, so old links resolve there instead of 404-ing on a missing anchor.
    view = "about";
  }
  return {
    view: VIEWS.includes(view as View) ? (view as View) : DEFAULTS.view,
    metric: sp.get("metric") || DEFAULTS.metric,
    mode: MODES.includes(mode as Mode) ? (mode as Mode) : DEFAULTS.mode,
    region: sp.get("region") || DEFAULTS.region,
    selected: sp.get("selected") || undefined,
    story,
  };
}

export function encode(s: AppState): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === "" || (DEFAULTS as unknown as Record<string, unknown>)[k] === v) continue;
    p.set(k, String(v));
  }
  return p.toString();
}

export function useUrlState(): [AppState, (patch: Partial<AppState>) => void] {
  const router = useRouter();
  const sp = useSearchParams();
  const state = decode(new URLSearchParams(sp.toString()));
  const set = useCallback(
    (patch: Partial<AppState>) => {
      const next = { ...decode(new URLSearchParams(window.location.search)), ...patch };
      const qs = encode(next);
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router],
  );
  return [state, set];
}
