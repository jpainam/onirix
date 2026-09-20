import { PanelRightCloseIcon } from "@onirix/ui/lib/icons";
import { useEffect, type ReactNode } from "react";

import {
  Sidebar,
  SidebarProvider,
  useSidebar,
} from "@onirix/ui/components/sidebar";
import { cn } from "@onirix/ui/lib/utils";

export type DockTab = "documents" | "source";

const TABS: { id: DockTab; label: string }[] = [
  { id: "documents", label: "Documents" },
  { id: "source", label: "Source" },
];



/**
 * The panel on the right of a conversation: the documents it reads, and the
 * passage behind a citation. The dashboard's own dock
 * (`apps/dashboard/.../chat/side-dock.tsx`), so the two look and move alike.
 *
 * It is the app sidebar's own primitive, mirrored: it pushes the conversation
 * aside rather than covering it, and slides on the same curve. On a phone it
 * opens as a sheet instead.
 *
 * Every pane stays mounted while another is shown, so a search typed into
 * Documents is still there after a look at a source.
 */
export function SideDock({
  open,
  onOpenChange,
  tab,
  onTabChange,
  documentCount,
  panes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: DockTab;
  onTabChange: (tab: DockTab) => void;
  documentCount: number;
  panes: Record<DockTab, ReactNode>;
}) {
  return (
    <SidebarProvider
      open={open}
      onOpenChange={onOpenChange}
      // The app sidebar owns Cmd+B and the state cookie; this one has neither,
      // or one key press would move both and they would share a cookie.
      keyboardShortcut={false}
      cookieName={false}
      width="24rem"
      className="min-h-0 w-auto flex-none"
    >
      <PhoneSheetSync open={open} onOpenChange={onOpenChange} />
      <Sidebar side="right" collapsible="offcanvas">
        <div className="bg-background text-foreground flex h-full min-h-0 flex-col border-l">
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
                    "text-ink-03 hover:bg-tint-01 hover:text-ink-04 flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors motion-reduce:transition-none",
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
              className="text-ink-02 hover:bg-tint-02 hover:text-ink-04 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors motion-reduce:transition-none"
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
                inert={tab !== entry.id}
                className={cn(
                  "absolute inset-0 flex min-h-0 flex-col",
                  tab !== entry.id && "invisible",
                )}
              >
                {panes[entry.id]}
              </div>
            ))}
          </div>
        </div>
      </Sidebar>
    </SidebarProvider>
  );
}

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
