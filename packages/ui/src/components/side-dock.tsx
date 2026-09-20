"use client";

import { ArrowLeftIcon, DownloadIcon, PanelRightCloseIcon } from "@onirix/ui/lib/icons";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { Button } from "@onirix/ui/components/button";
import { DocumentViewer } from "@onirix/ui/components/document-viewer";
import {
  Sidebar,
  SidebarProvider,
  useSidebar,
} from "@onirix/ui/components/sidebar";
import { cn } from "@onirix/ui/lib/utils";

export type DockTab = "documents" | "source";

/** A document opened to be read, over whichever pane it was opened from. */
export type DockPreview = { id: string; title: string };

const TABS: { id: DockTab; label: string }[] = [
  { id: "documents", label: "Documents" },
  { id: "source", label: "Source" },
];

/** Widths in pixels. The default is the 24rem the panel has always opened at. */
const DEFAULT_WIDTH = 384;
const MIN_WIDTH = 320;
/** What a page needs to be legible, used until the reader picks a width. */
const READING_WIDTH = 640;
/** The most of the window the panel may take, so the answer keeps a column. */
const MAX_WINDOW_SHARE = 0.65;
const KEYBOARD_STEP = 24;
const WIDTH_STORAGE_KEY = "onirix:dock-width";

const widestAllowed = () =>
  Math.max(MIN_WIDTH, Math.round(window.innerWidth * MAX_WINDOW_SHARE));

/**
 * The panel's width, and what changes it.
 *
 * The reader's own width wins once they have dragged one and is kept for next
 * time. Until then the panel is as wide as its content asks: narrow for a list,
 * wider for a page.
 */
function useDockWidth(reading: boolean) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [widest, setWidest] = useState(Number.POSITIVE_INFINITY);

  useEffect(() => {
    // Read after mount: the server cannot know it, and the panel starts shut,
    // so nothing is on screen to jump.
    try {
      const stored = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
      if (Number.isFinite(stored) && stored >= MIN_WIDTH) setChosen(stored);
    } catch {
      // Storage can be blocked; the panel just opens at its default.
    }

    const measure = () => setWidest(widestAllowed());
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const wanted = chosen ?? (reading ? READING_WIDTH : DEFAULT_WIDTH);
  const width = Math.min(Math.max(wanted, MIN_WIDTH), widest);

  function choose(next: number | null, remember: boolean) {
    const clamped =
      next === null ? null : Math.min(Math.max(Math.round(next), MIN_WIDTH), widestAllowed());
    setChosen(clamped);
    if (!remember) return;
    try {
      if (clamped === null) window.localStorage.removeItem(WIDTH_STORAGE_KEY);
      else window.localStorage.setItem(WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // Not remembered, which costs a drag next time and nothing else.
    }
  }

  return { width, widest, choose };
}


/**
 * The panel on the right of a conversation.
 *
 * It is the app sidebar's own primitive, mirrored: it pushes the conversation
 * aside rather than covering it, and slides on the same curve. On a phone it
 * opens as a sheet instead.
 *
 * Every pane stays mounted while another is shown, so a search typed into
 * Documents is still there after a look at a source. A document opened to be
 * read is laid over them for the same reason: going back finds them as left.
 *
 * Its inner edge is a divider that can be dragged, or moved with the arrow
 * keys, and double-clicked to go back to the default.
 */
export function SideDock({
  open,
  onOpenChange,
  tab,
  onTabChange,
  documentCount,
  panes,
  preview,
  onClosePreview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: DockTab;
  onTabChange: (tab: DockTab) => void;
  documentCount: number;
  panes: Record<DockTab, ReactNode>;
  preview: DockPreview | null;
  onClosePreview: () => void;
}) {
  const { width, widest, choose } = useDockWidth(preview !== null);
  const [resizing, setResizing] = useState(false);
  // Null until the pointer actually moves, so a plain click on the divider
  // does not pin whatever width the panel happened to have.
  const dragged = useRef<number | null>(null);

  // The panel is pinned to the window's right edge, so its width is simply
  // how far the pointer is from that edge.
  function drag(event: PointerEvent<HTMLDivElement>) {
    if (!resizing) return;
    dragged.current = window.innerWidth - event.clientX;
    choose(dragged.current, false);
  }

  function endDrag() {
    if (!resizing) return;
    setResizing(false);
    if (dragged.current !== null) choose(dragged.current, true);
  }

  function nudge(event: KeyboardEvent<HTMLDivElement>) {
    const next =
      event.key === "ArrowLeft"
        ? width + KEYBOARD_STEP
        : event.key === "ArrowRight"
          ? width - KEYBOARD_STEP
          : event.key === "Home"
            ? widest
            : event.key === "End"
              ? MIN_WIDTH
              : null;
    if (next === null) return;
    event.preventDefault();
    choose(next, true);
  }

  return (
    <SidebarProvider
      open={open}
      onOpenChange={onOpenChange}
      // The app sidebar owns Cmd+B and the state cookie; this one has neither,
      // or one key press would move both and they would share a cookie.
      keyboardShortcut={false}
      cookieName={false}
      width={`${width}px`}
      data-resizing={resizing}
      className="min-h-0 w-auto flex-none"
    >
      <PhoneSheetSync open={open} onOpenChange={onOpenChange} />
      <Sidebar side="right" collapsible="offcanvas">
        <div className="bg-background text-foreground relative flex h-full min-h-0 flex-col border-l">
          {/* Capturing the pointer keeps the drag alive over a PDF or a page
              of HTML, which sit in frames that would otherwise swallow it. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            aria-valuenow={width}
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={Number.isFinite(widest) ? widest : undefined}
            tabIndex={0}
            data-resizing={resizing}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              dragged.current = null;
              setResizing(true);
            }}
            onPointerMove={drag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={() => choose(null, true)}
            onKeyDown={nudge}
            className="after:bg-ring absolute inset-y-0 left-0 z-30 hidden w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:after:opacity-100 data-[resizing=true]:after:opacity-100 md:block"
          />

          <div className="flex h-shell shrink-0 items-center gap-1 border-b pr-2 pl-3">
            <div role="tablist" aria-label="Panel" className="flex flex-1 items-center gap-1">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  id={`dock-tab-${entry.id}`}
                  aria-selected={tab === entry.id}
                  aria-controls={`dock-pane-${entry.id}`}
                  onClick={() => onTabChange(entry.id)}
                  className={cn(
                    "text-ink-03 hover:bg-tint-01 hover:text-ink-04 flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors",
                    tab === entry.id && "bg-tint-02 text-ink-05 hover:bg-tint-02",
                  )}
                >
                  {entry.label}
                  {entry.id === "documents" && documentCount > 0 ? (
                    <span className="text-ink-02 font-mono text-xs tabular-nums">
                      {documentCount}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close panel"
              className="text-ink-02 hover:bg-tint-02 hover:text-ink-04 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
            >
              <PanelRightCloseIcon className="size-4.5" />
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            {TABS.map((entry) => (
              <div
                key={entry.id}
                role="tabpanel"
                id={`dock-pane-${entry.id}`}
                aria-labelledby={`dock-tab-${entry.id}`}
                // Out of the tab order as well as out of sight.
                inert={tab !== entry.id || preview !== null}
                className={cn(
                  "absolute inset-0 flex min-h-0 flex-col",
                  tab !== entry.id && "invisible",
                )}
              >
                {panes[entry.id]}
              </div>
            ))}

            {preview ? (
              <div className="bg-background absolute inset-0 z-10 flex min-h-0 flex-col">
                <div className="flex h-10 shrink-0 items-center gap-1 border-b pr-2 pl-1.5">
                  <Button
                    variant="muted"
                    size="icon-sm"
                    aria-label="Back"
                    onClick={onClosePreview}
                  >
                    <ArrowLeftIcon />
                  </Button>
                  <h3
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                    title={preview.title}
                  >
                    {preview.title}
                  </h3>
                  <Button
                    variant="muted"
                    size="icon-sm"
                    aria-label={`Download ${preview.title}`}
                    title="Download"
                    nativeButton={false}
                    render={<a href={documentFileUrl(preview.id)} download={preview.title} />}
                  >
                    <DownloadIcon />
                  </Button>
                </div>
                <DocumentViewer src={documentFileUrl(preview.id)} title={preview.title} />
              </div>
            ) : null}
          </div>
        </div>
      </Sidebar>
    </SidebarProvider>
  );
}

const documentFileUrl = (documentId: string) =>
  `/api/documents/${encodeURIComponent(documentId)}/file`;

/**
 * On a phone the primitive keeps a second, private open state for its sheet,
 * which a controlled `open` does not reach. This keeps the two in step in both
 * directions, so a sheet swiped away also reads as closed to the caller.
 */
function PhoneSheetSync({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (isMobile) setOpenMobile(open);
  }, [isMobile, open, setOpenMobile]);

  useEffect(() => {
    if (isMobile && !openMobile && open) onOpenChange(false);
    // `open` is left out on purpose: only a sheet that has just closed should
    // report back. Reacting to `open` as well would close the sheet again in
    // the very render where it was asked to open.
  }, [isMobile, openMobile]);

  return null;
}
