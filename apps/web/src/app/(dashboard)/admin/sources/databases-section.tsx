"use client";

/**
 * Connected databases on the Sources page.
 *
 * A database is a source that indexes nothing: the assistant queries it live.
 * What an admin needs from this section is to connect one, see that the
 * connection still works, decide who may query it, and disconnect it. The
 * connection string is typed once and never shown again; the row shows the
 * host and database it points at.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DatabaseIcon,
  GlobeIcon,
  ListIcon,
  NetworkIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
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
import { Textarea } from "@onirix/ui/components/textarea";

import { Row, Section } from "@/components/page";
import { trpc } from "@/utils/trpc";

import { SavedQueriesDialog } from "./saved-queries-dialog";

type Visibility = "organization" | "teams";
type Mode = "saved" | "adhoc";

/**
 * How each mode reads to an admin.
 *
 * "Saved queries only" is the default and the wording says why it is safe;
 * "Any read-only SQL" says exactly what is being allowed, since it is the one
 * choice that lets the model write its own queries.
 */
const MODE = {
  saved: { label: "Saved queries only", short: "Saved queries" },
  adhoc: { label: "Any read-only SQL", short: "Ad hoc SQL" },
} as const;

export function DatabasesSection({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [editingQueries, setEditingQueries] = useState<{ id: string; name: string } | null>(null);
  const [loosening, setLoosening] = useState<{ id: string; name: string } | null>(null);

  const databases = useQuery(trpc.database.list.queryOptions());
  const teams = useQuery({
    ...trpc.team.listTeams.queryOptions(),
    enabled: canManage,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: trpc.database.list.queryKey() });

  const refresh = useMutation(
    trpc.database.refreshSchema.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Schema refreshed: ${result.tableCount} tables.`);
        invalidate();
      },
      onError: (error) => {
        toast.error(error.message);
        invalidate();
      },
    }),
  );

  const setVisibility = useMutation(
    trpc.knowledge.setSourceDefaultVisibility.mutationOptions({
      // Takes effect on the next question: the chat route decides who may
      // query what at the start of every turn.
      onSuccess: () => {
        toast.success("Access updated.");
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const setMode = useMutation(
    trpc.database.setMode.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          result.mode === "saved"
            ? "The assistant now uses saved queries only."
            : "The assistant may now write its own read-only SQL.",
        );
        setLoosening(null);
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const remove = useMutation(
    trpc.database.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Database disconnected.");
        setRemoving(null);
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Section
      title="Databases"
      description="PostgreSQL databases the assistant can query for live figures."
      action={
        canManage ? (
          <Button variant="outline" size="sm" onClick={() => setConnecting(true)}>
            <PlusIcon />
            Connect database
          </Button>
        ) : null
      }
    >
      {databases.isPending ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : databases.data?.length === 0 ? (
        <p className="text-ink-03 text-sm">
          No databases connected. Connect one with a read-only role to let the
          assistant answer questions with live data.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {databases.data?.map((entry) => (
            <Row
              key={entry.id}
              icon={<DatabaseIcon />}
              title={
                <span className="flex items-center gap-2">
                  {entry.name}
                  {entry.status === "failed" ? (
                    <Badge variant="destructive">Unreachable</Badge>
                  ) : null}
                </span>
              }
              description={
                entry.status === "failed" && entry.lastError
                  ? entry.lastError
                  : [
                      entry.host ? `${entry.host}${entry.port ? `:${entry.port}` : ""}/${entry.database}` : null,
                      entry.mode === "saved"
                        ? `${entry.savedQueryCount} saved ${entry.savedQueryCount === 1 ? "query" : "queries"}`
                        : `${entry.tableCount} tables`,
                      entry.description,
                    ]
                      .filter(Boolean)
                      .join(" · ")
              }
              action={
                <div className="flex items-center gap-1.5">
                  {canManage ? (
                    <Select
                      value={entry.mode}
                      onValueChange={(value) => {
                        const next = String(value) as Mode;
                        if (next === entry.mode) return;
                        // Tightening needs no ceremony. Loosening is the one
                        // change that widens what the model can do, so it asks.
                        if (next === "adhoc") setLoosening({ id: entry.id, name: entry.name });
                        else setMode.mutate({ sourceId: entry.id, mode: next });
                      }}
                    >
                      <SelectTrigger data-size="sm" aria-label={`How the assistant may query ${entry.name}`}>
                        <SelectValue>{MODE[entry.mode].short}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="saved">{MODE.saved.label}</SelectItem>
                        <SelectItem value="adhoc">{MODE.adhoc.label}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-ink-03 text-xs">{MODE[entry.mode].short}</span>
                  )}
                  {canManage ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingQueries({ id: entry.id, name: entry.name })}
                    >
                      <ListIcon />
                      Queries
                    </Button>
                  ) : null}
                  <DatabaseAccess
                    visibility={entry.visibility}
                    teamNames={entry.teams.map((team) => team.name)}
                    teams={teams.data ?? []}
                    canManage={canManage}
                    onChange={(visibility, teamIds) =>
                      setVisibility.mutate({ sourceId: entry.id, visibility, teamIds })
                    }
                  />
                  {canManage ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Refresh the schema of ${entry.name}`}
                        disabled={refresh.isPending}
                        onClick={() => refresh.mutate({ sourceId: entry.id })}
                      >
                        {refresh.isPending && refresh.variables?.sourceId === entry.id ? (
                          <Spinner />
                        ) : (
                          <RefreshCwIcon />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Disconnect ${entry.name}`}
                        onClick={() => setRemoving({ id: entry.id, name: entry.name })}
                      >
                        <Trash2Icon className="text-destructive" />
                      </Button>
                    </>
                  ) : null}
                </div>
              }
            />
          ))}
        </div>
      )}

      {connecting ? (
        <ConnectDatabaseDialog
          teams={teams.data ?? []}
          onClose={() => setConnecting(false)}
          onConnected={invalidate}
        />
      ) : null}

      {editingQueries ? (
        <SavedQueriesDialog
          sourceId={editingQueries.id}
          databaseName={editingQueries.name}
          onClose={() => setEditingQueries(null)}
        />
      ) : null}

      {loosening ? (
        <Dialog open onOpenChange={(open) => !open && setLoosening(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Allow ad hoc SQL on {loosening.name}?</DialogTitle>
              <DialogDescription>
                The assistant will write its own SELECT statements against every
                table the connected role can read, for anyone allowed to query this
                database. Writes stay blocked. Choose this only when everyone with
                access may read all of that data.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLoosening(null)}>
                Keep saved queries only
              </Button>
              <Button
                disabled={setMode.isPending}
                onClick={() => setMode.mutate({ sourceId: loosening.id, mode: "adhoc" })}
              >
                {setMode.isPending ? <Spinner /> : null}
                Allow ad hoc SQL
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {removing ? (
        <Dialog open onOpenChange={(open) => !open && setRemoving(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect {removing.name}?</DialogTitle>
              <DialogDescription>
                The assistant stops querying it immediately. Nothing in the database
                itself is touched.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemoving(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ sourceId: removing.id })}
              >
                {remove.isPending ? <Spinner /> : null}
                Disconnect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </Section>
  );
}

/**
 * Who may query a database, as a control on its row.
 *
 * Same options and wording as a document's audience, minus "Only me": a
 * database has no uploader to be private to.
 */
function DatabaseAccess({
  visibility,
  teamNames,
  teams,
  canManage,
  onChange,
}: {
  visibility: "organization" | "teams" | "private";
  teamNames: string[];
  teams: { id: string; name: string }[];
  canManage: boolean;
  onChange: (visibility: Visibility, teamIds: string[]) => void;
}) {
  const [pickingTeam, setPickingTeam] = useState(false);
  const Icon = visibility === "organization" ? GlobeIcon : NetworkIcon;
  const label =
    visibility === "organization"
      ? "Everyone"
      : teamNames.length > 0
        ? teamNames.join(", ")
        : "No one";

  if (!canManage) {
    return (
      <span className="text-ink-03 flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5" />
        {label}
      </span>
    );
  }

  if (pickingTeam) {
    return (
      <Select
        value=""
        onValueChange={(value) => {
          setPickingTeam(false);
          onChange("teams", [String(value)]);
        }}
      >
        <SelectTrigger data-size="sm" aria-label="Choose a team">
          <SelectValue placeholder="Team…" />
        </SelectTrigger>
        <SelectContent>
          {teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select
      value={visibility === "organization" ? "organization" : "teams"}
      onValueChange={(value) => {
        if (value === "teams") {
          if (teams.length === 0) {
            toast.error("Create a team on the Teams page first.");
            return;
          }
          setPickingTeam(true);
          return;
        }
        onChange("organization", []);
      }}
    >
      <SelectTrigger data-size="sm" aria-label="Who may query this database">
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="organization">Everyone</SelectItem>
        <SelectItem value="teams">Teams</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ConnectDatabaseDialog({
  teams,
  onClose,
  onConnected,
}: {
  teams: { id: string; name: string }[];
  onClose: () => void;
  onConnected: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [connectionUrl, setConnectionUrl] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("organization");
  const [teamId, setTeamId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("saved");

  const connect = useMutation(
    trpc.database.connect.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Connected. ${result.tableCount} tables found.`);
        onConnected();
        onClose();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const incomplete =
    name.trim().length === 0 ||
    connectionUrl.trim().length === 0 ||
    (visibility === "teams" && teamId.length === 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a database</DialogTitle>
          <DialogDescription>
            Use a read-only role. A role that can write is refused.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="database-name">Name</Label>
            <Input
              id="database-name"
              value={name}
              placeholder="Discolaire"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="database-url">Connection URL</Label>
            <Input
              id="database-url"
              type="password"
              autoComplete="off"
              value={connectionUrl}
              placeholder="postgresql://readonly:password@host:5432/database"
              onChange={(event) => setConnectionUrl(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="database-description">What it holds (optional)</Label>
            <Textarea
              id="database-description"
              rows={2}
              value={description}
              placeholder="Student records, grades and fees."
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>How the assistant may query it</Label>
            <Select value={mode} onValueChange={(value) => setMode(String(value) as Mode)}>
              <SelectTrigger aria-label="How the assistant may query this database">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="saved">{MODE.saved.label}</SelectItem>
                <SelectItem value="adhoc">{MODE.adhoc.label}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-ink-03 text-xs">
              {mode === "saved"
                ? "Only queries you write and test here."
                : "The assistant writes its own SELECT statements."}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Who may query it</Label>
            <div className="flex gap-2">
              <Select
                value={visibility}
                onValueChange={(value) => setVisibility(String(value) as Visibility)}
              >
                <SelectTrigger aria-label="Who may query this database">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Everyone</SelectItem>
                  <SelectItem value="teams" disabled={teams.length === 0}>
                    One team
                  </SelectItem>
                </SelectContent>
              </Select>
              {visibility === "teams" ? (
                <Select value={teamId} onValueChange={(value) => setTeamId(String(value))}>
                  <SelectTrigger aria-label="Choose a team">
                    <SelectValue placeholder="Team…" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={incomplete || connect.isPending}
            onClick={() =>
              connect.mutate({
                name: name.trim(),
                description: description.trim() || null,
                connectionUrl: connectionUrl.trim(),
                mode,
                visibility,
                teamIds: visibility === "teams" ? [teamId] : [],
              })
            }
          >
            {connect.isPending ? <Spinner /> : null}
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
