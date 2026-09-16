"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2Icon,
  MailIcon,
  ShieldIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@onirix/ui/components/table";

import { Page, PageHeader, Row, Section } from "@/components/page";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const ROLE_VARIANT = {
  owner: "info",
  admin: "warning",
  member: "muted",
} as const;

export function TeamView({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);

  const members = useQuery(trpc.team.listMembers.queryOptions());
  const teams = useQuery(trpc.team.listTeams.queryOptions());
  const invitations = useQuery({
    ...trpc.team.listInvitations.queryOptions(),
    // Members are not allowed to see who is being invited.
    enabled: canManage,
  });

  /** Mutations go through Better Auth, so its own checks run before ours. */
  function refresh() {
    void queryClient.invalidateQueries();
  }

  async function run(action: () => Promise<{ error?: { message?: string } | null }>, ok: string) {
    const result = await action();
    if (result.error) {
      toast.error(result.error.message ?? "Something went wrong.");
      return false;
    }
    toast.success(ok);
    refresh();
    return true;
  }

  return (
    <Page>
      <PageHeader
        icon={UsersIcon}
        title="Users & Teams"
        description="Manage members and department access."
        action={
          canManage ? (
            <Button onClick={() => setInviting(true)}>
              <UserPlusIcon />
              Invite users
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-10">
        <Section
          title="Departments"
          description="Only department members can access its documents."
          action={
            canManage ? (
              <Button variant="outline" size="sm" onClick={() => setCreatingTeam(true)}>
                <Building2Icon />
                New department
              </Button>
            ) : null
          }
        >
          {teams.isPending ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : teams.data?.length === 0 ? (
            <Empty variant="outline">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Building2Icon />
                </EmptyMedia>
                <EmptyTitle>No departments yet</EmptyTitle>
                <EmptyDescription>
                  Documents are shared with everyone until you create one.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {teams.data?.map((group) => (
                <Row
                  key={group.id}
                  icon={<Building2Icon />}
                  title={group.name}
                  description={`${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}${group.joined ? " · you are a member" : ""}`}
                  action={
                    canManage ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void run(
                            () => authClient.organization.removeTeam({ teamId: group.id }),
                            `Removed ${group.name}.`,
                          )
                        }
                      >
                        <Trash2Icon />
                        Remove
                      </Button>
                    ) : null
                  }
                />
              ))}
            </div>
          )}
        </Section>

        <Section title="Members">
          {members.isPending ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <div className="bg-card overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-32">Role</TableHead>
                    <TableHead>Departments</TableHead>
                    <TableHead className="w-56" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.data?.map((row) => (
                    <TableRow key={row.memberId}>
                      <TableCell variant="strong">
                        {row.name}
                        <p className="text-ink-03 text-xs font-normal">{row.email}</p>
                      </TableCell>
                      <TableCell>
                        {canManage && row.role !== "owner" ? (
                          <Select
                            value={row.role}
                            onValueChange={(value) =>
                              void run(
                                () =>
                                  authClient.organization.updateMemberRole({
                                    memberId: row.memberId,
                                    role: String(value) as "admin" | "member",
                                  }),
                                `${row.name} is now ${String(value)}.`,
                              )
                            }
                          >
                            <SelectTrigger data-size="sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">admin</SelectItem>
                              <SelectItem value="member">member</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={ROLE_VARIANT[row.role] ?? "muted"}>
                            {row.role}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <MemberTeams
                          userId={row.userId}
                          memberTeams={row.teams}
                          allTeams={teams.data ?? []}
                          canManage={canManage}
                          onChanged={refresh}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && row.role !== "owner" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void run(
                                () =>
                                  authClient.organization.removeMember({
                                    memberIdOrEmail: row.memberId,
                                  }),
                                `Removed ${row.name}.`,
                              )
                            }
                          >
                            Remove
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>

        {canManage && (invitations.data?.length ?? 0) > 0 ? (
          <Section title="Pending invitations">
            <div className="flex flex-col gap-2">
              {invitations.data?.map((invite) => (
                <Row
                  key={invite.id}
                  icon={<MailIcon />}
                  title={invite.email}
                  description={`Invited by ${invite.inviterName} · ${invite.expired ? "expired" : `expires ${new Date(invite.expiresAt).toLocaleDateString()}`}`}
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void run(
                          () =>
                            authClient.organization.cancelInvitation({
                              invitationId: invite.id,
                            }),
                          "Invitation cancelled.",
                        )
                      }
                    >
                      Cancel
                    </Button>
                  }
                />
              ))}
            </div>
          </Section>
        ) : null}
      </div>

      {inviting ? (
        <InviteDialog
          teams={teams.data ?? []}
          onClose={() => setInviting(false)}
          onInvite={run}
        />
      ) : null}

      {creatingTeam ? (
        <CreateTeamDialog onClose={() => setCreatingTeam(false)} onCreate={run} />
      ) : null}
    </Page>
  );
}

type RunAction = (
  action: () => Promise<{ error?: { message?: string } | null }>,
  ok: string,
) => Promise<boolean>;

/**
 * The departments one member belongs to, each removable, with a picker for the
 * rest.
 *
 * Membership is edited here rather than on the department, because the question
 * an admin actually arrives with is "what should this person be able to see?".
 */
function MemberTeams({
  userId,
  memberTeams,
  allTeams,
  canManage,
  onChanged,
}: {
  userId: string;
  memberTeams: { id: string; name: string }[];
  allTeams: { id: string; name: string }[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const joined = new Set(memberTeams.map((group) => group.id));
  const available = allTeams.filter((group) => !joined.has(group.id));

  async function change(
    action: () => Promise<{ error?: { message?: string } | null }>,
    ok: string,
  ) {
    const result = await action();
    if (result.error) {
      toast.error(result.error.message ?? "Something went wrong.");
      return;
    }
    toast.success(ok);
    onChanged();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {memberTeams.length === 0 ? (
        <span className="text-ink-03 text-xs">None</span>
      ) : (
        memberTeams.map((group) => (
          <Badge key={group.id} variant="outline">
            {group.name}
            {canManage ? (
              <button
                type="button"
                aria-label={`Remove from ${group.name}`}
                className="text-ink-03 hover:text-foreground ml-1"
                onClick={() =>
                  void change(
                    () =>
                      authClient.organization.removeTeamMember({
                        teamId: group.id,
                        userId,
                      }),
                    `Removed from ${group.name}.`,
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
            const teamId = String(value);
            const name = available.find((group) => group.id === teamId)?.name ?? "team";
            void change(
              () => authClient.organization.addTeamMember({ teamId, userId }),
              `Added to ${name}.`,
            );
          }}
        >
          <SelectTrigger data-size="sm" aria-label="Add to a department">
            <SelectValue placeholder="Add…" />
          </SelectTrigger>
          <SelectContent>
            {available.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

function InviteDialog({
  teams,
  onClose,
  onInvite,
}: {
  teams: { id: string; name: string }[];
  onClose: () => void;
  onInvite: RunAction;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [teamId, setTeamId] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    setSending(true);
    try {
      const ok = await onInvite(
        () =>
          authClient.organization.inviteMember({
            email: email.trim(),
            role,
            ...(teamId ? { teamId } : {}),
          }),
        `Invitation sent to ${email.trim()}.`,
      );
      if (ok) onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to your workspace</DialogTitle>
          <DialogDescription>We&apos;ll send a link to this address.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              placeholder="colleague@company.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole(String(value) as "admin" | "member")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Department</Label>
              <Select value={teamId} onValueChange={(value) => setTeamId(String(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-ink-03 flex items-start gap-2 text-xs leading-4">
            <ShieldIcon className="mt-0.5 size-3.5 shrink-0" />
            Admin access does not override department membership.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!email.trim() || sending}>
            {sending ? <Spinner /> : null}
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <DialogTitle>New department</DialogTitle>
          <DialogDescription>Group document access by department.</DialogDescription>
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
          <Button onClick={() => void submit()} disabled={!name.trim() || saving}>
            {saving ? <Spinner /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
