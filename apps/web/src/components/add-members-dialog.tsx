"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@onirix/ui/components/command";
import { Spinner } from "@onirix/ui/components/spinner";

import { PersonAvatar } from "@/components/person-avatar";
import { useDebounced } from "@/hooks/use-debounced";
import { authClient } from "@/lib/auth-client";
import { useAuthAction } from "@/lib/auth-action";
import { trpc } from "@/utils/trpc";

/**
 * Adds people to a team, one search at a time.
 *
 * The roster is searched on the server rather than filtered in the browser: a
 * workspace large enough to need this dialog is too large to ship whole, and
 * the picker this replaces could only offer the colleagues the page happened to
 * have already loaded. The query leaves out whoever is already on the team, so
 * every result is something this dialog can actually do.
 *
 * It stays open after an add, because inviting a department into a new team is
 * one errand, not six.
 */
export function AddMembersDialog({
  teamId,
  teamName,
  open,
  onOpenChange,
}: {
  teamId: string;
  teamName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const run = useAuthAction();
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 200);

  // A fresh dialog starts on the unfiltered list rather than on whatever was
  // typed the last time it was opened.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const candidates = useQuery({
    ...trpc.team.searchMembers.queryOptions({
      query: search,
      excludeTeamId: teamId,
      limit: 20,
    }),
    enabled: open,
    // Each keystroke is a new query key; without this the list would blink out
    // to a spinner between one search and the next.
    placeholderData: keepPreviousData,
  });

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Add members to ${teamName}`}
      description={`Search everyone in this workspace who is not already in ${teamName}.`}
      className="sm:max-w-lg"
    >
      {/* The server has already narrowed and ordered the list; cmdk filtering
          on top of it would hide hits whose match is in an email. */}
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={`Add someone to ${teamName}…`}
          autoFocus
        />

        <CommandList>
          {candidates.isPending ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : candidates.data?.length === 0 ? (
            <CommandEmpty>
              {search.trim()
                ? `Nobody outside ${teamName} matches “${search.trim()}”.`
                : `Everyone in this workspace is already in ${teamName}.`}
            </CommandEmpty>
          ) : (
            candidates.data?.map((person) => (
              <CommandItem
                key={person.userId}
                value={person.userId}
                onSelect={() =>
                  void run(
                    () =>
                      authClient.organization.addTeamMember({
                        teamId,
                        userId: person.userId,
                      }),
                    `Added ${person.name} to ${teamName}.`,
                  )
                }
              >
                <PersonAvatar name={person.name} image={person.image} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{person.name}</span>
                  <span className="text-ink-03 truncate text-xs">
                    {person.email}
                  </span>
                </span>
              </CommandItem>
            ))
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

