"use client";
import { useEffect, useRef, useState } from "react";

/** Collapsible page-bottom section (methods / sources). Server-rendered content arrives
 *  as children so it stays crawlable inside the single HTML document; the panel opens
 *  when its own #hash is targeted (header/footer links) or on click. */
export default function AccordionSection({
  id,
  title,
  sub,
  children,
}: {
  id: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${id}`) {
        setOpen(true);
        ref.current?.scrollIntoView({ block: "start" });
      }
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [id]);

  return (
    <section id={id} ref={ref} className="section-acc" aria-label={title}>
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>
          <span className="acc-title">{title}</span>
          {sub && <span className="acc-sub">{sub}</span>}
          <span className="acc-chevron" aria-hidden="true">›</span>
        </summary>
        <div className="acc-body">{children}</div>
      </details>
    </section>
  );
}
