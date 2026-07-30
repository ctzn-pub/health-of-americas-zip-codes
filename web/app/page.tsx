import type { Metadata } from "next";
import { Suspense } from "react";
import AppClient from "@/components/AppClient";
import AboutSection from "@/components/spa/sections/AboutSection";
import StoriesIndexSection from "@/components/spa/sections/StoriesIndexSection";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Health of America's ZIP Codes — a map-first atlas of U.S. health outcomes",
  description: SITE.description,
  alternates: { canonical: "/" },
};

// One page, no routing: the atlas IS the page, and the top nav is the only view switcher
// (?view=measure | snapshot | stories | about, ?story=<slug> inside stories). Stories and
// About are passed in as server-rendered children so the single HTML document still carries
// real, crawlable prose, methods, and provenance.
export default function Page() {
  return (
    <Suspense
      fallback={
        <main id="main" className="app">
          <p className="muted" style={{ padding: 40 }}>Loading the atlas…</p>
        </main>
      }
    >
      <AppClient storiesIndex={<StoriesIndexSection />} aboutSection={<AboutSection />} />
    </Suspense>
  );
}
