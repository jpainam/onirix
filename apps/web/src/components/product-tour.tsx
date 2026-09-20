"use client";

import Image from "next/image";
import Link from "next/link";
import { BoxesIcon, ChevronRightIcon, MessageSquareTextIcon, SparklesIcon } from "@onirix/ui/lib/icons";
import type { LucideIcon } from "@onirix/ui/lib/icons";
import { useEffect, useRef, useState } from "react";

import { cn } from "@onirix/ui/lib/utils";

import { MediaPanel } from "@/components/section";

/**
 * The product tour: real screenshots in one flat framed panel, with a row of
 * tabs along its top. Each tab swaps the screenshot.
 *
 * The tabs rotate on a clock until a visitor picks one; from then on the
 * panel is theirs. The countdown bar under the open tab is the clock, and
 * its duration lives in CSS (`--animate-tab-progress`), so ROTATE_MS has to
 * agree with it.
 *
 * The screenshots are a shade taller than the 16:9 panel. `object-top` spends
 * the difference at the bottom edge, so the app's own header is never sliced.
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
    <MediaPanel className="motion-safe:animate-rise-in">
      <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-2 sm:pb-3">
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
                  "focus-visible:ring-ring/50 relative flex h-9 shrink-0 cursor-pointer items-center gap-2 overflow-hidden rounded-lg border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3",
                  selected
                    ? "bg-card text-foreground border-border"
                    : "text-ink-03 hover:text-foreground border-transparent",
                )}
              >
                {/* The countdown to the next tab. Remounted on every change
                    of tab, and again when the clock stops, so the animation
                    restarts from empty. Once a visitor has taken over it
                    holds at full width and simply marks the open tab. */}
                {selected ? (
                  <span
                    key={rotating ? active : "held"}
                    aria-hidden
                    className={cn(
                      "bg-primary absolute inset-x-0 bottom-0 h-0.5 origin-left",
                      rotating ? "animate-tab-progress" : "scale-x-100",
                    )}
                  />
                ) : null}
                <Icon aria-hidden className="size-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <Link
          href="/download"
          className="text-ink-03 hover:text-foreground ml-auto hidden shrink-0 items-center gap-1 px-2 text-sm whitespace-nowrap transition-colors sm:inline-flex"
        >
          Get the desktop app
          <ChevronRightIcon className="size-3.5" aria-hidden />
        </Link>
      </div>

      <div
        id="tour-panel"
        role="tabpanel"
        aria-labelledby={`tour-tab-${current.id}`}
        className="bg-card relative aspect-video overflow-hidden rounded-lg border sm:rounded-xl"
      >
        {TABS.map((tab, index) => (
          <Image
            key={tab.id}
            src={tab.image}
            alt={tab.alt}
            width={1600}
            height={900}
            preload={index === 0}
            sizes="(min-width: 1280px) 1120px, calc(100vw - 3rem)"
            aria-hidden={index !== active}
            className={cn(
              "absolute inset-0 size-full object-cover object-top transition-opacity duration-500",
              index === active ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          />
        ))}
      </div>
    </MediaPanel>
  );
}
