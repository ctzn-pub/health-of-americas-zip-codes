import type { Metadata } from "next";
import { Suspense } from "react";
import SpaShell from "@/components/spa/SpaShell";
import LandingSection from "@/components/spa/sections/LandingSection";
import MethodsSection from "@/components/spa/sections/MethodsSection";
import SourcesSection from "@/components/spa/sections/SourcesSection";
import StoriesIndexSection from "@/components/spa/sections/StoriesIndexSection";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Health of America's ZIP Codes — a map-first atlas of U.S. health outcomes",
  description: SITE.description,
  alternates: { canonical: "/" },
};

// Single-page app: every section renders on "/" and is switched client-side by the `p`
// query param (?p=atlas | stories | story&s=<slug> | methods | sources). The prose
// sections below are server-rendered at build with real numbers; the atlas and the
// story articles are client islands that fetch their payloads on demand.
export default function Page() {
  return (
    <Suspense
      fallback={
        <main id="main" className="app">
          <p className="muted" style={{ padding: 40 }}>Loading…</p>
        </main>
      }
    >
      <SpaShell
        sections={{
          home: <LandingSection />,
          stories: <StoriesIndexSection />,
          methods: <MethodsSection />,
          sources: <SourcesSection />,
        }}
      />
    </Suspense>
  );
}
