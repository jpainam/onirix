"use client";

import { useQuery } from "@tanstack/react-query";
import { NetworkIcon, PlusIcon, ShieldIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@onirix/ui/components/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select";
import { Spinner } from "@onirix/ui/components/spinner";

import { Notice, Page, PageHeader, Section } from "@/components/page";
import { authClient } from "@/lib/auth-client";
import type { AuthAction } from "@/lib/auth-action";
import { useAuthAction } from "@/lib/auth-action";
import { trpc } from "@/utils/trpc";

type RunAction = (action: AuthAction, ok: string) => Promise<boolean>;

type Member = {
  userId: string;
  name: string;
  email: string;
  teams: { id: string; name: string }[];
};

/**
 * Teams, Better Auth's second axis of access, one card each with its roster.
 *
 * A team is the unit documents are shared with, so this page answers "who can
 * reach what Engineering has?". The same membership is editable per person on
 * the Users page; both go through Better Auth, so neither side is authoritative.
 */
export function TeamsView({ canManage }: { canManage: boolean }) {
  const run = useAuthAction();
  const [creating, setCreating] = useState(false);

  const teams = useQuery(trpc.team.listTeams.queryOptions());
  const members = useQuery(trpc.team.listMembers.queryOptions());

  // The roster of a team is the member list read the other way round: Better
  // Auth has no call that returns a team with its users, and the members query
  // already carries every membership this organization has.
  const byTeam = new Map<string, Member[]>();
  for (const row of members.data ?? []) {
    for (const group of row.teams) {
      byTeam.set(group.id, [...(byTeam.get(group.id) ?? []), row]);
    }
  }

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
          description="Add and remove members here, or from a person's row on the Users page."
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
                  members={byTeam.get(group.id) ?? []}
                  allMembers={members.data ?? []}
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
 * One team: its name, who is in it, and the picker that puts someone there.
 *
 * The card carries its own roster rather than linking away to it: a team with
 * no members looks identical to one with ten in a list of counts, and that is
 * the mistake this page exists to make visible.
 */
function TeamCard({
  team,
  members,
  allMembers,
  canManage,
  run,
}: {
  team: { id: string; name: string; memberCount: number; joined: boolean };
  members: Member[];
  allMembers: Member[];
  canManage: boolean;
  run: RunAction;
}) {
  const joined = new Set(members.map((row) => row.userId));
  const available = allMembers.filter((row) => !joined.has(row.userId));

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="text-ink-04 flex size-5 shrink-0 items-center justify-center">
          <NetworkIcon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{team.name}</span>
          <span className="text-ink-03 truncate text-xs leading-4">
            {members.length} {members.length === 1 ? "member" : "members"}
            {team.joined ? " · you are a member" : ""}
          </span>
        </div>
        {canManage ? (
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
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-8">
        {members.length === 0 ? (
          <span className="text-ink-03 text-xs">No members yet</span>
        ) : (
          members.map((row) => (
            <Badge key={row.userId} variant="outline" title={row.email}>
              {row.name}
              {canManage ? (
                <button
                  type="button"
                  aria-label={`Remove ${row.name} from ${team.name}`}
                  className="text-ink-03 hover:text-foreground ml-1"
                  onClick={() =>
                    void run(
                      () =>
                        authClient.organization.removeTeamMember({
                          teamId: team.id,
                          userId: row.userId,
                        }),
                      `Removed ${row.name} from ${team.name}.`,
                    )
                  }
                >
                  ×
                </button>
              ) : null}
            </Badge>
          ))
        )}
        {canManage && available.length > 0 ? (
          <Select
            value=""
            onValueChange={(value) => {
              const userId = String(value);
              const name =
                available.find((row) => row.userId === userId)?.name ?? "member";
              void run(
                () =>
                  authClient.organization.addTeamMember({
                    teamId: team.id,
                    userId,
                  }),
                `Added ${name} to ${team.name}.`,
              );
            }}
          >
            <SelectTrigger data-size="sm" aria-label={`Add a member to ${team.name}`}>
              <SelectValue placeholder="Add member…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((row) => (
                <SelectItem key={row.userId} value={row.userId}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
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
