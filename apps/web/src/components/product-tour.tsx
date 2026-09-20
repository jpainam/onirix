"use client";

import Image from "next/image";
import Link from "next/link";
import { BoxesIcon, ChevronRightIcon, MessageSquareTextIcon, SparklesIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@onirix/ui/lib/utils";

/**
 * The product tour: one app window standing on a horizon, with browser-style
 * tabs across the top. Each tab swaps the screenshot inside the window.
 *
 * The tabs rotate on a clock until a visitor picks one; from then on the
 * window is theirs. The countdown bar across the open tab is the clock, and
 * its duration lives in CSS (`--animate-tab-progress`), so ROTATE_MS has to
 * agree with it.
 *
 * Above `lg` the section is a fixed height and clips, so the window runs off
 * the bottom of the horizon the way a real screen would. Below `lg` it is
 * left whole.
 *
 * The screenshots are a shade taller than the 16:9 panel. `object-top` spends
 * the difference at the bottom edge, which on `lg` is already off the band,
 * so the app's own header is never sliced.
 *
 * The frame's top edge is a line drawn inside the tab bar, along its bottom.
 * The open tab's card background covers its own stretch of it, so the tab
 * runs straight into the frame the way a browser tab does.
 */
type Tab = {
  id: string;
  label: string;
  icon: LucideIcon;
  image: string;
  alt: string;
};

const TABS: Tab[] = [
  {
    id: "workspace",
    label: "Workspace",
    icon: MessageSquareTextIcon,
    image: "/images/dashboard-window.webp",
    alt: "A conversation on the left, with the document it produced open beside it",
  },
  {
    id: "models",
    label: "Models",
    icon: BoxesIcon,
    image: "/images/select_model.png",
    alt: "The model catalog, with an open model selected and ready to download",
  },
  {
    id: "skills",
    label: "Skills",
    icon: SparklesIcon,
    image: "/images/define_skills.png",
    alt: "The skills settings, listing skill folders that can be switched on",
  },
];

const ROTATE_MS = 6000;

export function ProductTour() {
  const [active, setActive] = useState(0);
  /* A visitor who picks a tab owns the window from then on. */
  const [held, setHeld] = useState(false);
  /* Whether the clock is running, which is what the countdown bar draws.
     False on the server, under reduced motion, and once a visitor takes over. */
  const [rotating, setRotating] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (held) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setRotating(true);
    const timer = window.setInterval(
      () => setActive((index) => (index + 1) % TABS.length),
      ROTATE_MS,
    );
    return () => {
      window.clearInterval(timer);
      setRotating(false);
    };
  }, [held]);

  function pick(index: number) {
    setHeld(true);
    setActive(index);
  }

  /* Roving tabindex: the arrow keys move between tabs and select as they go,
     so the window follows the focus ring. */
  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (active + step + TABS.length) % TABS.length;
    pick(next);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }

  const current = TABS[active] ?? TABS[0]!;

  return (
    <section
      id="tour"
      aria-labelledby="tour-heading"
      className="relative scroll-mt-20 overflow-y-clip lg:h-160"
    >
      {/* The tour is a picture of the product, so the heading is for the
          document outline, not the eye. */}
      <h2 id="tour-heading" className="sr-only">
        Onirix product tour
      </h2>

      <Horizon />

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="bg-card relative flex flex-col overflow-hidden rounded-t-2xl border border-b-0 shadow-xl">
          <div className="bg-tint-01 no-scrollbar relative z-10 flex h-12 shrink-0 items-end gap-1 overflow-x-auto overflow-y-hidden px-2 pt-2">
            {/* The frame's top edge. First in the bar so every tab paints
                over it; only the open tab has a background to do so. */}
            <span
              aria-hidden
              className="bg-border pointer-events-none absolute inset-x-2 bottom-0 h-px"
            />
            <div
              ref={tabsRef}
              role="tablist"
              aria-label="Onirix product tour"
              onKeyDown={onKeyDown}
              className="contents"
            >
              {TABS.map((tab, index) => {
                const selected = index === active;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`tour-tab-${tab.id}`}
                    aria-controls="tour-panel"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => pick(index)}
                    className={cn(
                      "focus-visible:ring-ring/50 relative flex shrink-0 cursor-pointer items-center gap-2 overflow-hidden rounded-t-lg border border-b-0 px-3.5 py-2.5 text-sm leading-tight font-medium outline-none transition-colors focus-visible:ring-3",
                      selected
                        ? "bg-card text-foreground border-border"
                        : "text-ink-03 hover:text-foreground border-transparent",
                    )}
                  >
                    {/* The countdown to the next tab. Remounted on every
                        change of tab, and again when the clock stops, so the
                        animation restarts from empty. Once a visitor has
                        taken over it holds at full width and simply marks
                        which tab is open. */}
                    {selected ? (
                      <span
                        key={rotating ? active : "held"}
                        aria-hidden
                        className={cn(
                          "bg-primary absolute inset-x-0 top-0 h-0.5 origin-left",
                          rotating ? "animate-tab-progress" : "scale-x-100",
                        )}
                      />
                    ) : null}
                    <Icon
                      aria-hidden
                      className={cn("size-4 shrink-0", selected ? "text-ink-04" : "text-ink-02")}
                    />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <Link
              href="/download"
              className="bg-card text-ink-03 hover:text-foreground mb-1.5 ml-auto hidden shrink-0 items-center gap-1.5 self-center rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors lg:inline-flex"
            >
              Get the desktop app
              <ChevronRightIcon className="size-3.5" aria-hidden />
            </Link>
          </div>

          <div
            id="tour-panel"
            role="tabpanel"
            aria-labelledby={`tour-tab-${current.id}`}
            className="bg-tint-01 px-2"
          >
            <div className="bg-card relative aspect-video overflow-hidden border-x">
              {TABS.map((tab, index) => (
                <Image
                  key={tab.id}
                  src={tab.image}
                  alt={tab.alt}
                  width={1600}
                  height={900}
                  preload={index === 0}
                  sizes="(min-width: 1280px) 1200px, calc(100vw - 3rem)"
                  aria-hidden={index !== active}
                  className={cn(
                    "absolute inset-0 size-full object-cover object-top transition-opacity duration-500",
                    index === active ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The dithered band under the window. Rendered bottom-up, so the ink sits on
 * the section's bottom edge, flush with the dark band that follows, and the
 * ramp lightens into the page above it.
 */
function Horizon() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 flex h-48 flex-col-reverse lg:h-80"
    >
      <div className="dark bg-tint-01 flex-2" />
      <div className="horizon-ink flex-1" />
      <div className="horizon-stone flex-1" />
      <div className="horizon-mist flex-1" />
      <div className="horizon-page flex-1" />
    </div>
  );
}
