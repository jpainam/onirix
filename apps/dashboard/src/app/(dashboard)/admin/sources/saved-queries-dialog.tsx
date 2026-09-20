"use client";

/**
 * The saved queries of one database.
 *
 * In saved mode these are the whole of what the assistant can ask, so the
 * editor is built around getting one right: name it, say when it applies,
 * write the SELECT with `$1..$n`, declare each parameter, and run it with test
 * values before saving. The test uses the same binding and the same read-only
 * executor the assistant will, so what the admin sees is what the model gets.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlayIcon, PlusIcon, Trash2Icon } from "@onirix/ui/lib/icons";
import { useState } from "react";
import { toast } from "sonner";

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

import { trpc } from "@/utils/trpc";

const PARAMETER_TYPES = ["text", "integer", "number", "boolean", "date"] as const;
type ParameterType = (typeof PARAMETER_TYPES)[number];

type Parameter = { name: string; type: ParameterType; description: string };

type Draft = {
  id: string | null;
  name: string;
  description: string;
  sql: string;
  parameters: Parameter[];
};

const EMPTY_DRAFT: Draft = { id: null, name: "", description: "", sql: "", parameters: [] };

export function SavedQueriesDialog({
  sourceId,
  databaseName,
  onClose,
}: {
  sourceId: string;
  databaseName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const queries = useQuery(trpc.database.listSavedQueries.queryOptions({ sourceId }));

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: trpc.database.listSavedQueries.queryKey({ sourceId }),
    });
    void queryClient.invalidateQueries({ queryKey: trpc.database.list.queryKey() });
  };

  const remove = useMutation(
    trpc.database.deleteSavedQuery.mutationOptions({
      onSuccess: () => {
        toast.success("Saved query deleted.");
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (draft) {
    return (
      <QueryEditor
        sourceId={sourceId}
        databaseName={databaseName}
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          invalidate();
        }}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Saved queries for {databaseName}</DialogTitle>
          <DialogDescription>
            In saved-queries mode these are the only questions the assistant can put
            to this database. It picks one by its description and fills in the
            parameters.
          </DialogDescription>
        </DialogHeader>

        {queries.isPending ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : queries.data?.length === 0 ? (
          <p className="text-ink-03 py-4 text-sm">
            No saved queries yet. Until one exists the assistant cannot read from this
            database.
          </p>
        ) : (
          <div className="flex flex-col divide-y rounded-xl border">
            {queries.data?.map((query) => (
              <div key={query.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm">
                    {query.name}(
                    {query.parameters
                      .map((parameter) => `${parameter.name}: ${parameter.type}`)
                      .join(", ")}
                    )
                  </p>
                  <p className="text-ink-03 mt-0.5 text-xs">{query.description}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      id: query.id,
                      name: query.name,
                      description: query.description,
                      sql: query.sql,
                      parameters: query.parameters.map((parameter) => ({
                        name: parameter.name,
                        type: parameter.type,
                        description: parameter.description ?? "",
                      })),
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${query.name}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: query.id })}
                >
                  <Trash2Icon className="text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => setDraft(EMPTY_DRAFT)}>
            <PlusIcon />
            New query
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QueryEditor({
  sourceId,
  databaseName,
  draft: initial,
  onClose,
  onSaved,
}: {
  sourceId: string;
  databaseName: string;
  draft: Draft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{
    columns: string[];
    rows: (string | number | boolean | null)[][];
    truncated: boolean;
  } | null>(null);

  const payload = {
    sourceId,
    name: draft.name.trim(),
    description: draft.description.trim(),
    sql: draft.sql.trim(),
    parameters: draft.parameters.map((parameter) => ({
      name: parameter.name.trim(),
      type: parameter.type,
      description: parameter.description.trim() || null,
    })),
  };

  const test = useMutation(
    trpc.database.testSavedQuery.mutationOptions({
      onSuccess: (result) => setTestResult(result),
      onError: (error) => {
        setTestResult(null);
        toast.error(error.message);
      },
    }),
  );

  const create = useMutation(
    trpc.database.createSavedQuery.mutationOptions({
      onSuccess: () => {
        toast.success("Saved query created.");
        onSaved();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const update = useMutation(
    trpc.database.updateSavedQuery.mutationOptions({
      onSuccess: () => {
        toast.success("Saved query updated.");
        onSaved();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const saving = create.isPending || update.isPending;
  const incomplete =
    payload.name.length === 0 ||
    payload.description.length === 0 ||
    payload.sql.length === 0 ||
    payload.parameters.some((parameter) => parameter.name.length === 0);

  function updateParameter(index: number, patch: Partial<Parameter>) {
    setDraft((current) => ({
      ...current,
      parameters: current.parameters.map((parameter, i) =>
        i === index ? { ...parameter, ...patch } : parameter,
      ),
    }));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? `Edit ${initial.name}` : "New saved query"}</DialogTitle>
          <DialogDescription>
            One SELECT against {databaseName}. Refer to parameters as $1, $2 and so
            on, in the order declared below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-96 flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="saved-query-name">Name</Label>
              <Input
                id="saved-query-name"
                value={draft.name}
                placeholder="students_enrolled"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="saved-query-description">When to use it</Label>
              <Input
                id="saved-query-description"
                value={draft.description}
                placeholder="Number of students enrolled in a given school year."
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="saved-query-sql">SQL</Label>
            {/* SQL reads better in a monospace face, but the Textarea owns its
                typography; the surrounding block sets the face instead. */}
            <div className="[&_textarea]:font-mono">
            <Textarea
              id="saved-query-sql"
              rows={6}
              value={draft.sql}
              placeholder={'SELECT count(*) AS students\nFROM "Enrollment" e\nJOIN "SchoolYear" sy ON sy.id = e."schoolYearId"\nWHERE sy.name = $1'}
              onChange={(event) => setDraft({ ...draft, sql: event.target.value })}
            />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Parameters</Label>
              <Button
                variant="ghost"
                size="sm"
                disabled={draft.parameters.length >= 12}
                onClick={() =>
                  setDraft({
                    ...draft,
                    parameters: [
                      ...draft.parameters,
                      { name: "", type: "text", description: "" },
                    ],
                  })
                }
              >
                <PlusIcon />
                Add ${draft.parameters.length + 1}
              </Button>
            </div>
            {draft.parameters.length === 0 ? (
              <p className="text-ink-03 text-xs">This query takes no parameters.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {draft.parameters.map((parameter, index) => (
                  <div key={index} className="grid grid-cols-[3rem_1fr_7rem_1fr_2rem] items-center gap-2">
                    <span className="text-ink-03 font-mono text-xs">${index + 1}</span>
                    <Input
                      aria-label={`Name of parameter ${index + 1}`}
                      value={parameter.name}
                      placeholder="school_year"
                      onChange={(event) => updateParameter(index, { name: event.target.value })}
                    />
                    <Select
                      value={parameter.type}
                      onValueChange={(value) =>
                        updateParameter(index, { type: String(value) as ParameterType })
                      }
                    >
                      <SelectTrigger aria-label={`Type of parameter ${index + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PARAMETER_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label={`Description of parameter ${index + 1}`}
                      value={parameter.description}
                      placeholder="e.g. 2025-2026"
                      onChange={(event) =>
                        updateParameter(index, { description: event.target.value })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove parameter ${index + 1}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          parameters: draft.parameters.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-tint-01 flex flex-col gap-2 rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Try it</span>
              <Button
                variant="outline"
                size="sm"
                disabled={incomplete || test.isPending}
                onClick={() =>
                  test.mutate({
                    ...payload,
                    values: payload.parameters.map((parameter) => ({
                      name: parameter.name,
                      value: testValues[parameter.name] ?? "",
                    })),
                  })
                }
              >
                {test.isPending ? <Spinner /> : <PlayIcon />}
                Run
              </Button>
            </div>
            {payload.parameters.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {payload.parameters.map((parameter) => (
                  <Input
                    key={parameter.name}
                    aria-label={`Test value for ${parameter.name}`}
                    placeholder={`${parameter.name} (${parameter.type})`}
                    value={testValues[parameter.name] ?? ""}
                    onChange={(event) =>
                      setTestValues({ ...testValues, [parameter.name]: event.target.value })
                    }
                  />
                ))}
              </div>
            ) : null}
            {testResult ? (
              testResult.rows.length === 0 ? (
                <p className="text-ink-03 text-xs">The query returned no rows.</p>
              ) : (
                <div className="bg-card max-h-48 overflow-auto rounded-lg border">
                  <table className="w-full text-left text-xs">
                    <thead className="text-ink-03">
                      <tr>
                        {testResult.columns.map((column, i) => (
                          <th key={`${column}-${i}`} className="px-2 py-1 font-medium">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {testResult.rows.map((row, r) => (
                        <tr key={r} className="border-t">
                          {row.map((cell, c) => (
                            <td key={c} className="max-w-48 truncate px-2 py-1">
                              {cell === null ? "null" : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button
            disabled={incomplete || saving}
            onClick={() =>
              draft.id
                ? update.mutate({ ...payload, id: draft.id })
                : create.mutate(payload)
            }
          >
            {saving ? <Spinner /> : null}
            {draft.id ? "Save" : "Create query"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
