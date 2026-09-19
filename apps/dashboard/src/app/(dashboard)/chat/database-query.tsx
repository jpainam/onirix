"use client";

/**
 * Shows a query the model ran, and what came back.
 *
 * A figure from a database has no `[n]` to click, so this is its provenance:
 * the reader sees which database was asked, the exact SQL, and the rows the
 * answer was read from. Closed by default to the one line that matters — what
 * the query was for and how many rows it returned — because a reader who asked
 * "how many students" wants the number in the prose, not a table; the table is
 * there for the reader who wants to check.
 */
import { databaseQueryOutputSchema, type DatabaseQueryOutput } from "@onirix/llm/database";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  DatabaseIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@onirix/ui/components/button";
import { Spinner } from "@onirix/ui/components/spinner";
import { cn } from "@onirix/ui/lib/utils";

import type { DatabaseQueryPart } from "@/lib/chat-message";

/**
 * Rows drawn before the table asks the reader to scroll. The model's result is
 * already capped; this is about the page, not the payload.
 */
const VISIBLE_ROWS = 50;

export function DatabaseQueryMessagePart({ part }: { part: DatabaseQueryPart }) {
  const input = part.input as { database?: string; purpose?: string; sql?: string } | undefined;
  const output = useMemo(
    () => (part.state === "output-available" ? databaseQueryOutputSchema.safeParse(part.output) : null),
    [part.state, part.output],
  );

  // While the call streams or runs, the only honest thing to show is that a
  // database is being asked: the SQL may still be arriving.
  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <Frame>
        <div className="text-ink-03 flex items-center gap-2 px-4 py-3 text-xs">
          <Spinner className="size-3.5" />
          <span className="truncate">
            {input?.purpose?.trim() || "Querying"}
            {input?.database ? ` · ${input.database}` : ""}
          </span>
        </div>
      </Frame>
    );
  }

  if (!output?.success) {
    return (
      <Frame>
        <ErrorLine
          purpose={input?.purpose}
          database={input?.database}
          message={
            part.state === "output-error"
              ? part.errorText || "The query could not be run."
              : "The query result was incomplete."
          }
        />
      </Frame>
    );
  }

  const result = output.data;
  if ("error" in result) {
    return (
      <Frame>
        <ErrorLine purpose={input?.purpose} database={result.database} message={result.error} />
        {result.sql ? <SqlBlock sql={result.sql} /> : null}
      </Frame>
    );
  }

  return <QueryResultCard purpose={input?.purpose} result={result} />;
}

function QueryResultCard({
  purpose,
  result,
}: {
  purpose: string | undefined;
  result: Extract<DatabaseQueryOutput, { rows: unknown }>;
}) {
  const [open, setOpen] = useState(false);
  const rows = result.rows.slice(0, VISIBLE_ROWS);
  const hidden = result.rows.length - rows.length;

  return (
    <Frame>
      {/* A plain button rather than the Collapsible primitive: the trigger is
          the whole summary row, styled as a row, which the primitive's own
          trigger is not meant to be. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hover:bg-tint-01 flex w-full items-center gap-2 px-4 py-3 text-left text-xs transition-colors"
        aria-label={open ? "Hide the query and its rows" : "Show the query and its rows"}
      >
        <ChevronRightIcon
          className={cn(
            "text-ink-02 size-3.5 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        <DatabaseIcon className="text-ink-03 size-3.5 shrink-0" />
        <span className="text-ink-04 min-w-0 flex-1 truncate font-medium">
          {purpose?.trim() || "Database query"}
        </span>
        <span className="text-ink-02 shrink-0 truncate">{result.database}</span>
        <span className="font-figure text-ink-02 shrink-0 tabular-nums">
          {describeRowCount(result)}
        </span>
      </button>
      {open ? (
        <>
          {result.query ? (
            <p className="text-ink-03 border-t px-4 py-2 font-mono text-xs">
              {result.query}(
              {(result.parameters ?? [])
                .map((parameter) => `${parameter.name} = ${JSON.stringify(parameter.value)}`)
                .join(", ")}
              )
            </p>
          ) : null}
          <SqlBlock sql={result.sql} />
          {result.columns.length > 0 && rows.length > 0 ? (
            <div className="max-h-80 overflow-auto border-t">
              <table className="w-full text-left text-xs">
                <thead className="bg-tint-01 text-ink-03 sticky top-0">
                  <tr>
                    {result.columns.map((column, i) => (
                      <th key={`${column}-${i}`} className="px-3 py-1.5 font-medium whitespace-nowrap">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, r) => (
                    <tr key={r} className="border-t">
                      {row.map((cell, c) => (
                        <td
                          key={c}
                          className={cn(
                            "max-w-64 truncate px-3 py-1.5",
                            typeof cell === "number" && "font-figure text-right tabular-nums",
                            cell === null && "text-ink-02",
                          )}
                          title={cell === null ? undefined : String(cell)}
                        >
                          {formatCell(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-ink-03 border-t px-4 py-3 text-xs">The query returned no rows.</p>
          )}
          {hidden > 0 || result.truncated ? (
            <p className="text-ink-02 border-t px-4 py-2 text-xs">
              {hidden > 0 ? `Showing ${rows.length} of ${result.rows.length} rows returned. ` : ""}
              {result.truncated ? "The result was cut at the row limit; the answer may be partial." : ""}
            </p>
          ) : null}
        </>
      ) : null}
    </Frame>
  );
}

function describeRowCount(result: { rowCount: number; truncated: boolean }): string {
  if (result.truncated) return `${result.rowCount}+ rows`;
  return result.rowCount === 1 ? "1 row" : `${result.rowCount} rows`;
}

function formatCell(cell: string | number | boolean | null): string {
  if (cell === null) return "null";
  if (typeof cell === "boolean") return cell ? "true" : "false";
  return String(cell);
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="bg-card my-3 overflow-hidden rounded-xl border">{children}</div>;
}

function ErrorLine({
  purpose,
  database,
  message,
}: {
  purpose: string | undefined;
  database: string | undefined;
  message: string;
}) {
  return (
    <div className="flex items-start gap-2 px-4 py-3 text-xs">
      <AlertCircleIcon className="text-destructive mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-ink-04 truncate font-medium">
          {purpose?.trim() || "Database query"}
          {database ? <span className="text-ink-02 font-normal"> · {database}</span> : null}
        </p>
        <p className="text-destructive mt-0.5 break-words">{message}</p>
      </div>
    </div>
  );
}

function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative border-t">
      <pre className="text-ink-04 overflow-x-auto px-4 py-3 pr-12 font-mono text-xs leading-5 whitespace-pre-wrap">
        {sql.trim()}
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-1.5 right-1.5"
        aria-label="Copy the SQL"
        onClick={() => {
          void navigator.clipboard.writeText(sql.trim()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}
