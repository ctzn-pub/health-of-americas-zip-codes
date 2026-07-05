// Shared site identity + navigation. Imported by metadata (server) and chrome (client).
// No "use client" and no browser APIs, so it is safe on both sides.

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://health-of-americas-zip-codes.vercel.app";

export const SITE = {
  name: "Health of America's ZIP Codes",
  short: "ZIP Health Atlas",
  tagline:
    "A map-first atlas of ZIP/ZCTA health, social needs, demographics, and neighborhood deprivation.",
  description:
    "An interactive atlas of 26 burden-oriented health and social-need measures across 32,409 U.S. ZIP/ZCTA areas, with ACS demographics, ADI context, state comparisons, and modeled CDC PLACES-style estimates.",
} as const;

// SPA navigation: every section lives on "/" and is addressed by the `p` query param.
export type PageId = "home" | "atlas" | "stories" | "story" | "methods" | "sources";

export const pagePath = (p: PageId) => (p === "home" ? "/" : `/?p=${p}`);

export const NAV: { href: string; page: PageId; label: string; cta?: boolean }[] = [
  { href: pagePath("atlas"), page: "atlas", label: "Atlas" },
  { href: pagePath("stories"), page: "stories", label: "Stories" },
  { href: pagePath("methods"), page: "methods", label: "Methods" },
  { href: pagePath("sources"), page: "sources", label: "Sources" },
  { href: pagePath("atlas"), page: "atlas", label: "Open the atlas", cta: true },
];
