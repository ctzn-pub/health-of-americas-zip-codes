"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NAV, SITE } from "@/lib/site";

// Global navigation for the one-page app — this IS the view switcher (there are no in-page
// tabs). Every entry is a ?view= toggle on "/", with home meaning pick-a-ZIP. Markup
// prerenders into the static HTML, so crawlers see real nav.
function NavLinks() {
  const sp = useSearchParams();
  const legacy = sp.get("p");
  const activeKey =
    sp.get("view") ??
    (legacy === "story" || legacy === "stories"
      ? "stories"
      : legacy === "methods" || legacy === "sources"
        ? "about"
        : "snapshot");
  return (
    <nav className="site-nav" aria-label="Primary">
      {NAV.map((item) => (
        <Link key={item.key} href={item.href} aria-current={item.key === activeKey ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function StaticNav() {
  return (
    <nav className="site-nav" aria-label="Primary">
      {NAV.map((item) => (
        <Link key={item.key} href={item.href}>{item.label}</Link>
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
