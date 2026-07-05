import type { Metadata } from "next";
import { Suspense } from "react";
import AppClient from "@/components/AppClient";
import AccordionSection from "@/components/spa/AccordionSection";
import MethodsSection from "@/components/spa/sections/MethodsSection";
import SourcesSection from "@/components/spa/sections/SourcesSection";
import StoriesIndexSection from "@/components/spa/sections/StoriesIndexSection";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Health of America's ZIP Codes — a map-first atlas of U.S. health outcomes",
  description: SITE.description,
  alternates: { canonical: "/" },
};

// One page, no routing: the atlas IS the page. Views toggle in place
// (?view=measure | snapshot | stories, ?story=<slug> inside stories), and methods /
// sources collapse into accordions below the atlas — server-rendered at build so the
// single HTML document still carries real, crawlable content and numbers.
export default function Page() {
  return (
    <>
      <Suspense
        fallback={
          <main id="main" className="app">
            <p className="muted" style={{ padding: 40 }}>Loading the atlas…</p>
          </main>
        }
      >
        <AppClient storiesIndex={<StoriesIndexSection />} />
      </Suspense>

      <div className="acc-stack">
        <AccordionSection
          id="methods"
          index="Appendix A"
          title="Methods & limitations"
          sub="Modeled estimates, ZIP vs ZCTA, view modes, the political layers, missingness"
        >
          <MethodsSection />
        </AccordionSection>
        <AccordionSection
          id="sources"
          index="Appendix B"
          title="Sources & provenance"
          sub="Underlying files, vintages, and per-measure provenance"
        >
          <SourcesSection />
        </AccordionSection>
      </div>
    </>
  );
}
