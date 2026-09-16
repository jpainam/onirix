"use client";

import { useQuery } from "@tanstack/react-query";
import { MailIcon, ShieldIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
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

import { MembershipPicker } from "@/components/membership-picker";
import { Page, PageHeader, Row, Section } from "@/components/page";
import { authClient } from "@/lib/auth-client";
import type { AuthAction } from "@/lib/auth-action";
import { useAuthAction } from "@/lib/auth-action";
import { trpc } from "@/utils/trpc";

const ROLE_VARIANT: Record<string, "info" | "warning" | "muted"> = {
  owner: "info",
  admin: "warning",
  member: "muted",
};

/**
 * Roles a member can be moved to.
 *
 * Owner is left out on purpose: Better Auth treats it as the workspace's
 * creator and has its own transfer path, so offering it here would be a second
 * way to do something that needs to stay deliberate.
 */
function assignableRoles(roles: { name: string; builtIn: boolean }[]) {
  return roles.filter((role) => role.name !== "owner");
}

/**
 * The people in the workspace: who they are, what they may administer, and which
 * teams they belong to.
 *
 * Teams themselves (creating them, and who is in one) live on the Teams page.
 * What stays here is the per-person view of the same membership, because the
 * question an admin arrives with while looking at a roster is "what should this
 * person be able to see?".
 */
export function UsersView({
  canManage,
  canInvite,
}: {
  canManage: boolean;
  canInvite: boolean;
}) {
  const run = useAuthAction();
  const [inviting, setInviting] = useState(false);

  const members = useQuery(trpc.team.listMembers.queryOptions());
  const teams = useQuery(trpc.team.listTeams.queryOptions());
  const roles = useQuery(trpc.team.listRoles.queryOptions());
  const invitations = useQuery({
    ...trpc.team.listInvitations.queryOptions(),
    // Only someone who may invite is allowed to see who is being invited.
    enabled: canInvite,
  });

  const roleOptions = assignableRoles(roles.data ?? []);

  return (
    <Page>
      <PageHeader
        icon={UsersIcon}
        title="Users"
        description="Everyone in this workspace, their access level, and their teams."
        action={
          canInvite ? (
            <Button onClick={() => setInviting(true)}>
              <UserPlusIcon />
              Invite users
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-10">
        <Section
          title="Members"
          description="A role says what someone may administer. Teams decide what they can reach."
        >
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
                    <TableHead>Teams</TableHead>
                    <TableHead className="w-56" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.data?.map((row) => (
                    <TableRow key={row.memberId}>
                      <TableCell variant="strong">
                        {row.name}
                        <p className="text-ink-03 text-xs font-normal">
                          {row.email}
                        </p>
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
                                    // Custom roles are names, not a closed
                                    // union; the endpoint takes any string and
                                    // rejects one the workspace has not defined.
                                    role: String(value) as never,
                                  }),
                                `${row.name} is now ${String(value)}.`,
                              )
                            }
                          >
                            <SelectTrigger data-size="sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((role) => (
                                <SelectItem key={role.name} value={role.name}>
                                  {role.name}
                                </SelectItem>
                              ))}
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
                          run={run}
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
          roles={roleOptions}
          teams={teams.data ?? []}
          onClose={() => setInviting(false)}
          onInvite={run}
        />
      ) : null}
    </Page>
  );
}

type RunAction = (action: AuthAction, ok: string) => Promise<boolean>;

/**
 * The teams one member belongs to, added and dropped from the same list.
 *
 * The same membership is editable from the other side on the Teams page; both
 * call the same Better Auth endpoints, so neither is the source of truth.
 */
function MemberTeams({
  userId,
  memberTeams,
  allTeams,
  canManage,
  run,
}: {
  userId: string;
  memberTeams: { id: string; name: string }[];
  allTeams: { id: string; name: string }[];
  canManage: boolean;
  run: RunAction;
}) {
  return (
    <MembershipPicker
      selected={memberTeams.map((group) => ({
        id: group.id,
        label: group.name,
      }))}
      options={allTeams.map((group) => ({ id: group.id, label: group.name }))}
      editable={canManage}
      addLabel="Add to a team"
      emptyLabel="None"
      searchPlaceholder="Search teams"
      notFoundLabel="No such team."
      removeLabel={(option) => `Remove from ${option.label}`}
      onAdd={(option) =>
        void run(
          () =>
            authClient.organization.addTeamMember({
              teamId: option.id,
              userId,
            }),
          `Added to ${option.label}.`,
        )
      }
      onRemove={(option) =>
        void run(
          () =>
            authClient.organization.removeTeamMember({
              teamId: option.id,
              userId,
            }),
          `Removed from ${option.label}.`,
        )
      }
    />
  );
}

function InviteDialog({
  roles,
  teams,
  onClose,
  onInvite,
}: {
  roles: { name: string }[];
  teams: { id: string; name: string }[];
  onClose: () => void;
  onInvite: RunAction;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [teamId, setTeamId] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    setSending(true);
    try {
      const ok = await onInvite(
        () =>
          authClient.organization.inviteMember({
            email: email.trim(),
            role: role as never,
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
          <DialogDescription>
            We&apos;ll send a link to this address.
          </DialogDescription>
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
                items={roles.map((option) => ({
                  value: option.name,
                  label: option.name,
                }))}
                value={role}
                onValueChange={(value) => setRole(String(value))}
              >
                <SelectTrigger className={"w-full"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((option) => (
                    <SelectItem key={option.name} value={option.name}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Team</Label>
              {teams.length === 0 ? (
                <p className="text-ink-03 text-xs leading-8">
                  No teams yet.{" "}
                  <Link href="/admin/teams" className="underline">
                    create one
                  </Link>
                  .
                </p>
              ) : (
                <Select
                  items={teams.map((group) => ({
                    value: group.id,
                    label: group.name,
                  }))}
                  value={teamId}
                  onValueChange={(value) => setTeamId(String(value))}
                >
                  <SelectTrigger className={"w-full"}>
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
              )}
            </div>
          </div>

          <p className="text-ink-03 flex items-start gap-2 text-xs leading-4">
            <ShieldIcon className="mt-0.5 size-3.5 shrink-0" />
            No role overrides team membership.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!email.trim() || sending}
          >
            {sending ? <Spinner /> : null}
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
