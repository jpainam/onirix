"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, NetworkIcon, PlusIcon, UsersIcon } from "@onirix/ui/lib/icons";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@onirix/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";
import { Spinner } from "@onirix/ui/components/spinner";

import { AddMembersDialog } from "@/components/add-members-dialog";
import { Page, PageHeader, Section } from "@/components/page";
import { PersonAvatar } from "@/components/person-avatar";
import { authClient } from "@/lib/auth-client";
import { useAuthAction } from "@/lib/auth-action";
import { trpc } from "@/utils/trpc";

type Member = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
};

/**
 * One team, in full: who is in it, and the two ways that changes.
 *
 * This is the page the teams list points at. Membership is the thing that
 * decides what a document reaches, so it earns a surface where the whole
 * roster is legible at once instead of a row of chips that truncates.
 */
export function TeamView({
  teamId,
  canManage,
}: {
  teamId: string;
  canManage: boolean;
}) {
  const run = useAuthAction();
  const [adding, setAdding] = useState(false);

  const team = useQuery(trpc.team.getTeam.queryOptions({ teamId }));

  if (team.isPending) {
    return (
      <Page>
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </Page>
    );
  }

  // The query scopes by organization, so a team from another workspace arrives
  // here as missing rather than as forbidden.
  if (team.isError || !team.data) {
    return (
      <Page>
        <Empty variant="outline">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NetworkIcon />
            </EmptyMedia>
            <EmptyTitle>No such team</EmptyTitle>
            <EmptyDescription>
              It may have been removed. <Link href="/admin/teams">Back to teams</Link>
              .
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Page>
    );
  }

  const { name, members, joined } = team.data;

  return (
    <Page>
      <Link
        href="/admin/teams"
        className="text-ink-03 hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeftIcon className="size-4" />
        Teams
      </Link>

      <PageHeader
        title={name}
        description={`${members.length} ${members.length === 1 ? "member" : "members"}${joined ? " · you are one of them" : ""}`}
        action={
          canManage ? (
            <Button onClick={() => setAdding(true)}>
              <PlusIcon />
              Add members
            </Button>
          ) : null
        }
      />

      <Section
        title="Members"
        description="Removing someone takes away what this team can reach, and nothing else."
      >
        {members.length === 0 ? (
          <Empty variant="outline">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>Nobody is in {name} yet</EmptyTitle>
              <EmptyDescription>
                A team with no members is a document nobody can read.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((person) => (
              <MemberRow
                key={person.userId}
                person={person}
                teamName={name}
                canManage={canManage}
                onRemove={() =>
                  void run(
                    () =>
                      authClient.organization.removeTeamMember({
                        teamId,
                        userId: person.userId,
                      }),
                    `Removed ${person.name} from ${name}.`,
                  )
                }
              />
            ))}
          </div>
        )}
      </Section>

      <AddMembersDialog
        teamId={teamId}
        teamName={name}
        open={adding}
        onOpenChange={setAdding}
      />
    </Page>
  );
}

/**
 * One person on the roster.
 *
 * Written out rather than built from `Row`: that row sizes its leading slot for
 * a glyph, and a face is not a glyph.
 */
function MemberRow({
  person,
  teamName,
  canManage,
  onRemove,
}: {
  person: Member;
  teamName: string;
  canManage: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border px-4 py-3">
      <PersonAvatar name={person.name} image={person.image} size="default" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{person.name}</span>
        <span className="text-ink-03 truncate text-xs leading-4">
          {person.email}
        </span>
      </div>
      {canManage ? (
        <Button
          variant="destructive"
          size="sm"
          aria-label={`Remove ${person.name} from ${teamName}`}
          onClick={onRemove}
        >
          Remove
        </Button>
      ) : null}
    </div>
  );
}
