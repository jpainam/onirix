"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BookOpenIcon,
  BrainIcon,
  BuildingIcon,
  CpuIcon,
  DatabaseIcon,
  DownloadIcon,
  FileTextIcon,
  NetworkIcon,
  PaletteIcon,
  ShieldIcon,
  SquarePenIcon,
  UsersIcon,
} from "@onirix/ui/lib/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { Route } from "next";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@onirix/ui/components/command";
import { Spinner } from "@onirix/ui/components/spinner";

import { trpc } from "@/utils/trpc";

const DESTINATIONS = [
  { title: "New session", url: "/chat", icon: SquarePenIcon },
  { title: "Knowledge", url: "/admin/knowledge", icon: BookOpenIcon },
  { title: "Sources", url: "/admin/sources", icon: DatabaseIcon },
  { title: "Explore agents", url: "/agents", icon: BrainIcon },
  { title: "Users", url: "/admin/users", icon: UsersIcon },
  { title: "Teams", url: "/admin/teams", icon: NetworkIcon },
  { title: "Roles", url: "/admin/roles", icon: ShieldIcon },
  { title: "Language models", url: "/admin/language-models", icon: CpuIcon },
  { title: "Open models", url: "/admin/open-models", icon: DownloadIcon },
  { title: "Organization", url: "/admin/organization", icon: BuildingIcon },
  { title: "Appearance", url: "/admin/appearance", icon: PaletteIcon },
] as const;

/** Opens the palette on ⌘K / Ctrl-K from anywhere in the app shell. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, setOpen };
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  const results = useQuery({
    ...trpc.search.query.queryOptions({ query: trimmed, limit: 8 }),
    // Nothing to search until the user types something meaningful.
    enabled: open && trimmed.length > 1,
  });

  function go(url: string) {
    onOpenChange(false);
    setQuery("");
    router.push(url as Route);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search your documents, or jump to a page."
      className="sm:max-w-xl"
    >
      {/* Ranking is the server's; cmdk would otherwise re-filter the hits it
          already scored, and drop ones whose match is in the body text. */}
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search documents, or jump to…"
          autoFocus
        />

        <CommandList>
          {trimmed.length > 1 ? (
            results.isPending ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : results.data && results.data.length > 0 ? (
              <CommandGroup heading="Documents">
                {results.data.map((hit) => (
                  <CommandItem
                    key={hit.documentId}
                    value={hit.documentId}
                    onSelect={() => go("/admin/sources")}
                  >
                    <FileTextIcon />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{hit.title}</span>
                      <span className="text-ink-03 truncate text-xs">
                        {hit.blurb}
                      </span>
                    </span>
                    <span className="text-ink-02 shrink-0 text-xs">
                      {hit.sourceType}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandEmpty>No documents match “{trimmed}”.</CommandEmpty>
            )
          ) : null}

          {trimmed.length > 1 && results.data && results.data.length > 0 ? (
            <CommandSeparator />
          ) : null}

          <CommandGroup heading="Go to">
            {DESTINATIONS.map((destination) => (
              <CommandItem
                key={destination.url}
                value={destination.url}
                onSelect={() => go(destination.url)}
              >
                <destination.icon />
                {destination.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
