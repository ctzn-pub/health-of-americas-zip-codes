// Shared site identity + navigation. Imported by metadata (server) and chrome (client).
// No "use client" and no browser APIs, so it is safe on both sides.

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://health-of-americas-zip-codes.vercel.app";

export const SITE = {
  name: "Health of America's ZIP Codes",
  short: "ZIP Health Atlas",
  tagline:
    "A map-first atlas of ZIP/ZCTA health, social needs, demographics, neighborhood deprivation, and presidential politics.",
  description:
    "An interactive one-page atlas of 26 burden-oriented health and social-need measures plus 2016/2020 presidential margins across 32,409 U.S. ZIP/ZCTA areas, with ACS demographics, ADI context, state comparisons, and modeled CDC PLACES-style estimates.",
} as const;

// One-page app: the atlas is "/", stories are a view toggle, methods/sources are
// in-page accordions reached by hash.
export const NAV: { href: string; key: string; label: string }[] = [
  { href: "/", key: "atlas", label: "Atlas" },
  { href: "/?view=stories", key: "stories", label: "Stories" },
  { href: "#methods", key: "methods", label: "Methods" },
  { href: "#sources", key: "sources", label: "Sources" },
];
