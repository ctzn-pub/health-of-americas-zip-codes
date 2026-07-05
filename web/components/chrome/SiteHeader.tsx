"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NAV, SITE } from "@/lib/site";

// Global navigation for the one-page app: Atlas and Stories toggle the in-page view,
// Methods and Sources jump to the collapsible sections at the bottom. Markup prerenders
// into the static HTML, so crawlers see real nav.
function NavLinks() {
  const sp = useSearchParams();
  const view = sp.get("view") ?? (sp.get("p") === "story" || sp.get("p") === "stories" ? "stories" : "measure");
  const activeKey = view === "stories" ? "stories" : "atlas";
  return (
    <nav className="site-nav" aria-label="Primary">
      {NAV.map((item) =>
        item.href.startsWith("#") ? (
          // plain anchor: Link's pushState never fires hashchange, which the accordions rely on
          <a key={item.key} href={item.href}>{item.label}</a>
        ) : (
          <Link key={item.key} href={item.href} aria-current={item.key === activeKey ? "page" : undefined}>
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}

function StaticNav() {
  return (
    <nav className="site-nav" aria-label="Primary">
      {NAV.map((item) =>
        item.href.startsWith("#") ? (
          <a key={item.key} href={item.href}>{item.label}</a>
        ) : (
          <Link key={item.key} href={item.href}>{item.label}</Link>
        ),
      )}
    </nav>
  );
}

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label={`${SITE.name} — home`}>
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            Health of America&apos;s <span className="dim">ZIP Codes</span>
          </span>
        </Link>
        <Suspense fallback={<StaticNav />}>
          <NavLinks />
        </Suspense>
      </div>
    </header>
  );
}
