"use client";

import { useQuery } from "@tanstack/react-query";
import { NetworkIcon, PlusIcon, ShieldIcon, Trash2Icon } from "@onirix/ui/lib/icons";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@onirix/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@onirix/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";
import { Input } from "@onirix/ui/components/input";
import { Label } from "@onirix/ui/components/label";
import { Spinner } from "@onirix/ui/components/spinner";

import { AddMembersDialog } from "@/components/add-members-dialog";
import { Notice, Page, PageHeader, Section } from "@/components/page";
import { authClient } from "@/lib/auth-client";
import type { AuthAction } from "@/lib/auth-action";
import { useAuthAction } from "@/lib/auth-action";
import { trpc } from "@/utils/trpc";

type RunAction = (action: AuthAction, ok: string) => Promise<boolean>;

/**
 * Teams, Better Auth's second axis of access, one card each.
 *
 * A team is the unit documents are shared with, so the question this page opens
 * is "who can reach what Engineering has?"; the team's own page answers it. The
 * same membership is editable per person on the Users page, and all three go
 * through Better Auth, so no one of them is authoritative.
 */
export function TeamsView({ canManage }: { canManage: boolean }) {
  const run = useAuthAction();
  const [creating, setCreating] = useState(false);

  const teams = useQuery(trpc.team.listTeams.queryOptions());

  return (
    <Page>
      <PageHeader
        icon={NetworkIcon}
        title="Teams"
        description="Teams group users (Engineering, Sales, HR) and decide what each can reach."
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              New team
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-10">
        <Notice
          icon={ShieldIcon}
          title="Team membership is what restricts a document"
          description="A document shared with a team is reachable by its members only. Admin access does not override that."
        />

        <Section
          title="Teams"
          description="Open a team to see who is in it, or add people to it from here."
        >
          {teams.isPending ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : teams.data?.length === 0 ? (
            <Empty variant="outline">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <NetworkIcon />
                </EmptyMedia>
                <EmptyTitle>No teams yet</EmptyTitle>
                <EmptyDescription>
                  Documents are shared with everyone in the workspace until you
                  create one.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {teams.data?.map((group) => (
                <TeamCard
                  key={group.id}
                  team={group}
                  canManage={canManage}
                  run={run}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      {creating ? (
        <CreateTeamDialog onClose={() => setCreating(false)} onCreate={run} />
      ) : null}
    </Page>
  );
}

/**
 * One team in the list: its name, how many are in it, and the two things worth
 * doing without opening it.
 *
 * The card used to carry the whole roster as chips. That reads well for a team
 * of three and falls apart at thirty, so the roster moved to the team's own
 * page and the name became the way in. Adding people stayed here, because the
 * list is where someone stands when they realise a team is short.
 */
function TeamCard({
  team,
  canManage,
  run,
}: {
  team: { id: string; name: string; memberCount: number; joined: boolean };
  canManage: boolean;
  run: RunAction;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="bg-card hover:bg-tint-01 relative flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors">
      <span className="text-ink-04 flex size-5 shrink-0 items-center justify-center">
        <NetworkIcon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Stretched over the whole card, so the row is one target and the
            buttons beside it stay their own. */}
        <Link
          href={`/admin/teams/${team.id}`}
          className="truncate text-sm font-semibold after:absolute after:inset-0"
        >
          {team.name}
        </Link>
        <span className="text-ink-03 truncate text-xs leading-4">
          {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
          {team.joined ? " · you are a member" : ""}
        </span>
      </div>
      {canManage ? (
        <div className="relative flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <PlusIcon />
            Add members
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void run(
                () => authClient.organization.removeTeam({ teamId: team.id }),
                `Removed ${team.name}.`,
              )
            }
          >
            <Trash2Icon className="text-destructive" />
            Remove
          </Button>
        </div>
      ) : null}

      <AddMembersDialog
        teamId={team.id}
        teamName={team.name}
        open={adding}
        onOpenChange={setAdding}
      />
    </div>
  );
}

function CreateTeamDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: RunAction;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const ok = await onCreate(
        () => authClient.organization.createTeam({ name: name.trim() }),
        `Created ${name.trim()}.`,
      );
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New team</DialogTitle>
          <DialogDescription>
            Group document access by team, usually a department.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="team-name">Name</Label>
          <Input
            id="team-name"
            value={name}
            placeholder="Human Resources"
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!name.trim() || saving}
          >
            {saving ? <Spinner /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
