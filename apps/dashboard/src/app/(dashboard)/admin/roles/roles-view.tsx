"use client";

import { useQuery } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, ShieldIcon, Trash2Icon } from "@onirix/ui/lib/icons";
import { useState } from "react";

import {
  STATEMENTS,
  type Action,
  type Permissions,
  type Resource,
} from "@onirix/db/permissions";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import { Checkbox } from "@onirix/ui/components/checkbox";
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
import { Spinner } from "@onirix/ui/components/spinner";
import { cn } from "@onirix/ui/lib/utils";

import { Notice, Page, PageHeader, Row, Section } from "@/components/page";
import { authClient } from "@/lib/auth-client";
import type { AuthAction } from "@/lib/auth-action";
import { useAuthAction } from "@/lib/auth-action";
import { trpc } from "@/utils/trpc";

/**
 * How each resource reads to the person composing a role.
 *
 * Named for the page the permission unlocks rather than for the table it
 * guards: an admin building a "Librarian" is choosing which parts of the
 * product that person administers, not which rows they update.
 */
const RESOURCES: Record<Resource, { label: string; description: string }> = {
  source: {
    label: "Sources",
    description: "Upload documents, change who can see them, retry indexing.",
  },
  knowledge: {
    label: "Knowledge",
    description: "Create and edit knowledge collections.",
  },
  skill: {
    label: "Skills",
    description: "Write the instructions the assistant follows when answering.",
  },
  model: {
    label: "Language models",
    description: "Connect providers and choose the workspace default.",
  },
  member: {
    label: "Members",
    description: "Change what role someone holds, and remove people.",
  },
  invitation: {
    label: "Invitations",
    description: "Invite people, see and cancel pending invitations.",
  },
  team: {
    label: "Teams",
    description: "Create teams and decide who belongs to them.",
  },
  ac: {
    label: "Roles",
    description: "Create and edit roles, including this one.",
  },
  organization: {
    label: "Workspace",
    description: "Rename the workspace, or delete it entirely.",
  },
  usage: {
    label: "Usage",
    description: "See what the workspace asks, spends and indexes.",
  },
};

/** Render order, most often granted first. */
const RESOURCE_ORDER = Object.keys(RESOURCES) as Resource[];

const ACTION_LABELS: Record<string, string> = {
  create: "Create",
  read: "Read",
  update: "Update",
  delete: "Delete",
  cancel: "Cancel",
};

type Role = {
  id: string;
  name: string;
  builtIn: boolean;
  permissions: Permissions;
  memberCount: number;
};

type RunAction = (action: AuthAction, ok: string) => Promise<boolean>;

/**
 * Roles: what a member may administer.
 *
 * The three built-in roles are declared in code and shown read-only, because
 * changing what "admin" means underneath an existing workspace is a different
 * and much larger decision than adding a role beside it. Everything else is a
 * row in `organization_role`, created through Better Auth's dynamic access
 * control and enforced by `permissionProcedure` on every gated call.
 *
 * Roles are not how document access works. A role says what someone may
 * administer; teams say what they may read. Granting Sources to a role does not
 * widen what that person can see.
 */
export function RolesView({
  canManage,
  grantable,
}: {
  canManage: boolean;
  grantable: Permissions;
}) {
  const run = useAuthAction();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const roles = useQuery(trpc.team.listRoles.queryOptions());

  return (
    <Page wide>
      <PageHeader
        title="Roles"
        description="What a member may administer. Everyone holds exactly one role."
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon />
              New role
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-10">
        <Notice
          icon={ShieldIcon}
          title="A role is about administering, not about reading"
          description="Teams decide which documents a person can see. No role overrides that, including owner."
        />

        <Section
          title="Roles"
          description="Assign a role to someone from their row on the Users page."
        >
          {roles.isPending ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {roles.data?.map((role) => (
                <Row
                  key={role.id}
                  icon={<ShieldIcon />}
                  title={
                    <span className="flex items-center gap-2">
                      {role.name}
                      {role.builtIn ? (
                        <Badge variant="muted">Built-in</Badge>
                      ) : null}
                    </span>
                  }
                  description={`${describe(role.permissions)} · ${role.memberCount} ${role.memberCount === 1 ? "member" : "members"}`}
                  action={
                    canManage && !role.builtIn ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(role)}
                        >
                          <PencilIcon />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleting(role)}
                        >
                          <Trash2Icon className="text-destructive" />
                          Delete
                        </Button>
                      </div>
                    ) : null
                  }
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      {creating ? (
        <RoleDialog
          grantable={grantable}
          onClose={() => setCreating(false)}
          onSubmit={(name, permission) =>
            run(
              () =>
                authClient.organization.createRole({
                  role: name,
                  permission: permission as never,
                }),
              `Created ${name}.`,
            )
          }
        />
      ) : null}

      {editing ? (
        <RoleDialog
          role={editing}
          grantable={grantable}
          onClose={() => setEditing(null)}
          onSubmit={(name, permission) =>
            run(
              () =>
                authClient.organization.updateRole({
                  roleName: editing.name,
                  data: { permission: permission as never },
                }),
              `Updated ${name}.`,
            )
          }
        />
      ) : null}

      {deleting ? (
        <DeleteRoleDialog
          role={deleting}
          onClose={() => setDeleting(null)}
          onDelete={run}
        />
      ) : null}
    </Page>
  );
}

/** A one line summary of what a role opens, for the collapsed row. */
function describe(permissions: Permissions): string {
  const granted = RESOURCE_ORDER.filter(
    (resource) => (permissions[resource]?.length ?? 0) > 0,
  );
  if (granted.length === 0) return "No administration";
  if (granted.length === RESOURCE_ORDER.length) return "Everything";
  return granted.map((resource) => RESOURCES[resource].label).join(", ");
}

/**
 * The create and edit dialog, which are the same form over a different starting
 * point. Editing a role's name is not offered: the name is what members carry
 * in their `role` column, so renaming would orphan everyone holding it.
 */
function RoleDialog({
  role,
  grantable,
  onClose,
  onSubmit,
}: {
  role?: Role;
  grantable: Permissions;
  onClose: () => void;
  onSubmit: (name: string, permission: Record<string, string[]>) => Promise<boolean>;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [granted, setGranted] = useState<Permissions>(role?.permissions ?? {});
  const [saving, setSaving] = useState(false);

  function toggle(resource: Resource, action: string) {
    setGranted((current) => {
      const actions = new Set(current[resource] ?? []);
      if (actions.has(action)) actions.delete(action);
      else actions.add(action);
      return { ...current, [resource]: [...actions] };
    });
  }

  async function submit() {
    // Resources with nothing ticked are dropped rather than sent as empty
    // arrays, so a role's stored grants say only what it allows.
    const permission: Record<string, string[]> = {};
    for (const resource of RESOURCE_ORDER) {
      const actions = granted[resource];
      if (actions && actions.length > 0) permission[resource] = [...actions];
    }

    setSaving(true);
    try {
      const ok = await onSubmit(name.trim(), permission);
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  }

  const nothingGranted = RESOURCE_ORDER.every(
    (resource) => (granted[resource]?.length ?? 0) === 0,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
          <DialogDescription>
            Tick what this role may administer. Anything you cannot do yourself
            is unavailable.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {role ? null : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                value={name}
                placeholder="Librarian"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          )}

          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {RESOURCE_ORDER.map((resource) => (
              <div
                key={resource}
                className="flex items-start justify-between gap-6 rounded-lg px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">
                    {RESOURCES[resource].label}
                  </span>
                  <span className="text-ink-03 text-xs leading-4">
                    {RESOURCES[resource].description}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {STATEMENTS[resource].map((action: string) => {
                    const allowed = grantable[resource]?.includes(action) ?? false;
                    const checked = granted[resource]?.includes(action) ?? false;
                    return (
                      <label
                        key={action}
                        className={cn(
                          "flex items-center gap-1.5 text-xs",
                          allowed
                            ? "cursor-pointer"
                            : "text-ink-03 cursor-not-allowed opacity-60",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!allowed}
                          onCheckedChange={() => toggle(resource, action)}
                          aria-label={`${ACTION_LABELS[action] ?? action} ${RESOURCES[resource].label}`}
                        />
                        {ACTION_LABELS[action] ?? action}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={(!role && !name.trim()) || nothingGranted || saving}
          >
            {saving ? <Spinner /> : null}
            {role ? "Save" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({
  role,
  onClose,
  onDelete,
}: {
  role: Role;
  onClose: () => void;
  onDelete: RunAction;
}) {
  const [deleting, setDeleting] = useState(false);

  async function submit() {
    setDeleting(true);
    try {
      const ok = await onDelete(
        () => authClient.organization.deleteRole({ roleName: role.name }),
        `Deleted ${role.name}.`,
      );
      if (ok) onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {role.name}?</DialogTitle>
          <DialogDescription>
            {role.memberCount === 0
              ? "No one holds this role."
              : `${role.memberCount} ${role.memberCount === 1 ? "person holds" : "people hold"} this role and will be left able to administer nothing until you give them another one. They keep their team access and can still use Onirix.`}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void submit()}
            disabled={deleting}
          >
            {deleting ? <Spinner /> : null}
            Delete role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
