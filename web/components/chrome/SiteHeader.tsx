"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NAV, SITE } from "@/lib/site";

// Global navigation for the single-page app. Sections live on "/" behind the `p` query
// param, so the active link is derived from search params (wrapped in Suspense for the
// static export). The markup still prerenders into static HTML, so crawlers see real nav.
function NavLinks() {
  const sp = useSearchParams();
  const page = sp.get("p") ?? "home";
  return (
    <nav className="site-nav" aria-label="Primary">
      {NAV.map((item, i) => {
        const active = !item.cta && (page === item.page || (item.page === "stories" && page === "story"));
        return (
          <Link
            key={`${item.page}-${i}`}
            href={item.href}
            className={item.cta ? "nav-cta" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function StaticNav() {
  return (
    <nav className="site-nav" aria-label="Primary">
      {NAV.map((item, i) => (
        <Link key={`${item.page}-${i}`} href={item.href} className={item.cta ? "nav-cta" : undefined}>
          {item.label}
        </Link>
      ))}
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
