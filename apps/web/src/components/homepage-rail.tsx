// Adapted from Synara (MIT), Copyright (c) 2026 T3 Tools Inc. and Emanuele Di Pietro.
"use client";

import { useEffect, useState } from "react";

import { cn } from "@onirix/ui/lib/utils";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "privacy", label: "Privacy" },
  { id: "features", label: "Features" },
  { id: "self-host", label: "Self-host" },
  { id: "download", label: "Desktop" },
  { id: "faq", label: "FAQ" },
  { id: "start", label: "Get started" },
] as const;

/**
 * A quiet scroll-spy down the right edge, on screens wide enough to have an
 * empty margin for it. One thin line per section; the section in view gets
 * the long one.
 *
 * The page alternates light and ink bands, so the rail is drawn in the page
 * colour and blended by difference: dark lines over paper, light lines over
 * ink, with no need to know which band is under it.
 */
export function HomepageRail() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const sections = SECTIONS.map(({ id }) => document.getElementById(id)).filter(
      (section): section is HTMLElement => section !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const line = window.innerHeight * 0.3;
        const nearest = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top - line) - Math.abs(b.boundingClientRect.top - line),
          )[0];
        if (nearest) setActiveId(nearest.target.id);
      },
      { rootMargin: "-18% 0px -62% 0px", threshold: [0, 0.15, 0.5] },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Sections of this page"
      className="fixed top-1/2 right-4 z-30 hidden -translate-y-1/2 mix-blend-difference 2xl:block"
    >
      <ol className="flex flex-col items-end">
        {SECTIONS.map(({ id, label }) => {
          const active = activeId === id;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={active ? "location" : undefined}
                className="group focus-visible:ring-ring/50 flex h-5 items-center justify-end gap-2.5 rounded-sm outline-none focus-visible:ring-3"
              >
                <span className="text-background pointer-events-none font-mono text-xs whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
                  {label}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "bg-background block h-0.5 rounded-sm transition-all motion-reduce:transition-none",
                    active ? "w-8" : "w-4 opacity-50 group-hover:w-5 group-hover:opacity-100",
                  )}
                />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
