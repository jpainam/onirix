"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  HistoryIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "@onirix/ui/lib/icons";
import { useState } from "react";

import { Badge } from "@onirix/ui/components/badge";
import { Button } from "@onirix/ui/components/button";
import { Calendar } from "@onirix/ui/components/calendar";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@onirix/ui/components/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@onirix/ui/components/input-group";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@onirix/ui/components/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@onirix/ui/components/popover";
import { Separator } from "@onirix/ui/components/separator";
import { Spinner } from "@onirix/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@onirix/ui/components/table";
import { cn } from "@onirix/ui/lib/utils";

import { Page, PageHeader, Section } from "@/components/page";
import { PersonAvatar } from "@/components/person-avatar";
import { useDebounced } from "@/hooks/use-debounced";
import { useIsMobile } from "@/hooks/use-mobile";
import { trpc } from "@/utils/trpc";

const PAGE_SIZE = 25;

/** A calendar range, shaped like react-day-picker's own so it can be handed
 *  straight to `<Calendar mode="range">` without importing its types here. */
type DateRange = { from: Date | undefined; to?: Date | undefined };

/**
 * Query history: every conversation this workspace has had.
 *
 * Four filters, because those are the four ways an administrator arrives at
 * this page: with a word ("did anyone ask about the layoff memo?"), with a
 * person, with a week, or with nothing and a scroll. They compose, and every
 * one of them narrows the same server query rather than the rows already
 * fetched: a history that filters in the browser only ever filters the page you
 * happen to be on, which reads as "no results" for something that is on page 4.
 *
 * Conversations are private to their author everywhere else in the product.
 * This page is the exception the `usage:read` grant buys, and it is deliberately
 * the whole page rather than a control on one. See the route's `page.tsx`.
 */
export function QueryHistoryView() {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [reading, setReading] = useState<string | null>(null);

  const search = useDebounced(query, 250);

  // The first hundred members by name feed the filter; a larger roster is
  // searched by typing, which the picker does over this page's entries.
  const members = useQuery(trpc.team.listMembers.queryOptions({ pageSize: 100 }));

  const history = useQuery({
    ...trpc.history.list.queryOptions({
      query: search,
      userId,
      from: range?.from ? startOfDay(range.from).toISOString() : null,
      // A half-made range (one end clicked, the other not yet) reads as that
      // single day rather than as everything since it.
      to: endOfDay(range?.to ?? range?.from)?.toISOString() ?? null,
      page,
      pageSize: PAGE_SIZE,
    }),
    // Every keystroke and every page is a new query key; without this the table
    // would blink out to a spinner between one view of the same data and the next.
    placeholderData: keepPreviousData,
  });

  // Read from what is typed, not from the debounced copy: the "Clear filters"
  // button appearing a quarter of a second after the first keystroke reads as a
  // glitch.
  const filtered = Boolean(query.trim() || userId || range?.from);
  const rows = history.data?.rows ?? [];
  const total = history.data?.total ?? 0;
  const pageCount = history.data?.pageCount ?? 1;

  /** Any filter change puts you back on page 1: page 6 of a narrower result
   *  set is usually empty, and an empty page looks like an empty history. */
  function refine(apply: () => void) {
    apply();
    setPage(1);
  }

  const selectedMember = members.data?.items.find((row) => row.userId === userId);

  return (
    <Page wide className="max-w-6xl">
      <PageHeader
        title="Query History"
        description="Every conversation in this workspace."
      />

      <Section
        title="Conversations"
        description="Searching looks inside the messages, not only the titles."
      >
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-full min-w-56 flex-1 sm:w-auto">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              placeholder="Search questions and answers"
              onChange={(event) => refine(() => setQuery(event.target.value))}
            />
            {query ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Clear search"
                  onClick={() => refine(() => setQuery(""))}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>

          <MemberFilter
            members={members.data?.items ?? []}
            selected={selectedMember ?? null}
            onSelect={(next) => refine(() => setUserId(next))}
          />

          <DateRangeFilter
            range={range}
            onSelect={(next) => refine(() => setRange(next))}
          />

          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                refine(() => {
                  setQuery("");
                  setUserId(null);
                  setRange(undefined);
                })
              }
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        {history.isPending ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <Empty variant="outline">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HistoryIcon />
              </EmptyMedia>
              <EmptyTitle>
                {filtered ? "Nothing matches these filters" : "No questions yet"}
              </EmptyTitle>
              <EmptyDescription>
                {filtered
                  ? "Try a wider date range, or drop the search term."
                  : "Conversations appear here as soon as someone asks something."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          // Kept mounted while the next page loads, so only the ink fades.
          <div
            className={cn(
              "bg-card overflow-hidden rounded-xl border transition-opacity",
              history.isPlaceholderData && "opacity-60",
            )}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead className="w-56">Asked by</TableHead>
                  <TableHead className="w-20 text-right">Turns</TableHead>
                  <TableHead className="w-44">Model</TableHead>
                  <TableHead className="w-44">Asked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-0 whitespace-normal">
                      {/* The cell is the control: a row-wide click target that
                          is still a button, so it can be tabbed to and read as
                          one. */}
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setReading(row.id)}
                      >
                        <span className="line-clamp-2 font-medium">
                          {row.question ?? (
                            <span className="text-ink-03 italic">
                              Nothing was asked
                            </span>
                          )}
                        </span>
                        {row.answer ? (
                          <span className="text-ink-03 mt-0.5 line-clamp-1 text-xs">
                            {row.answer}
                          </span>
                        ) : null}
                      </button>
                    </TableCell>
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2">
                        <PersonAvatar
                          name={row.user.name}
                          image={row.user.image}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {row.user.name}
                          </span>
                          <span className="text-ink-03 truncate text-xs">
                            {row.user.email}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell variant="figure" className="text-right">
                      {row.questions}
                    </TableCell>
                    <TableCell>
                      {row.model ? (
                        <Badge variant="muted" title={row.model}>
                          <span className="max-w-36 truncate">{row.model}</span>
                        </Badge>
                      ) : (
                        <span className="text-ink-03 text-xs">Not recorded</span>
                      )}
                    </TableCell>
                    <TableCell variant="muted">
                      {formatWhen(row.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink-03 text-xs">
              {`Showing ${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()}`}
            </p>
            <Pager page={page} pageCount={pageCount} onPage={setPage} />
          </div>
        ) : null}
      </Section>

      {reading ? (
        <ConversationDialog chatId={reading} onClose={() => setReading(null)} />
      ) : null}
    </Page>
  );
}

/**
 * Narrows the history to one person.
 *
 * A searchable list rather than a select: the roster is the same list the Users
 * page already holds, and a workspace big enough to need this page is one where
 * scrolling to a name is slower than typing it.
 */
function MemberFilter({
  members,
  selected,
  onSelect,
}: {
  members: { userId: string; name: string; email: string; image?: string | null }[];
  selected: { userId: string; name: string; image?: string | null } | null;
  onSelect: (userId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Filter by member">
            {selected ? (
              <PersonAvatar name={selected.name} image={selected.image} />
            ) : (
              <UsersIcon />
            )}
            {selected ? selected.name : "Anyone"}
          </Button>
        }
      />
      <PopoverContent variant="plain" align="start" className="w-64">
        <Command>
          <CommandInput placeholder="Search members" />
          <CommandList>
            <CommandEmpty>Nobody by that name.</CommandEmpty>
            <CommandItem
              value="anyone"
              data-checked={selected === null}
              onSelect={() => {
                onSelect(null);
                setOpen(false);
              }}
            >
              <UsersIcon />
              Anyone
            </CommandItem>
            {members.map((person) => (
              <CommandItem
                key={person.userId}
                // Two colleagues can share a name; the id keeps cmdk from
                // treating them as one entry.
                value={`${person.name} ${person.email} ${person.userId}`}
                data-checked={selected?.userId === person.userId}
                onSelect={() => {
                  onSelect(person.userId);
                  setOpen(false);
                }}
              >
                <PersonAvatar name={person.name} image={person.image} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{person.name}</span>
                  <span className="text-ink-03 truncate text-xs">
                    {person.email}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** The windows worth one click, since most questions about a history are about
 *  the recent one. */
const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
] as const;

/**
 * Narrows the history to a span of days.
 *
 * Both ends are inclusive calendar days in the reader's own timezone, widened
 * to instants only at the edge where the query is built: someone picking
 * "today" means their today, not UTC's.
 */
function DateRangeFilter({
  range,
  onSelect,
}: {
  range: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Filter by date">
            <CalendarIcon />
            {rangeLabel(range)}
          </Button>
        }
      />
      <PopoverContent variant="plain" align="start" className="w-auto">
        {/* Shortcuts beside the months, not above them: most ranges are picked
            from this column, and reading it first is the point. It falls back
            to a row on a phone, where there is no width to give it. */}
        <div className="flex flex-col md:flex-row">
          <div className="flex flex-wrap items-start gap-1 p-2 md:w-36 md:flex-col">
            {PRESETS.map((preset) => (
              <Button
                key={preset.days}
                variant="ghost"
                size="xs"
                className="md:w-full md:justify-start"
                onClick={() => {
                  onSelect({ from: daysAgo(preset.days - 1), to: new Date() });
                  setOpen(false);
                }}
              >
                {preset.label}
              </Button>
            ))}
            {range?.from ? (
              <Button
                variant="ghost"
                size="xs"
                className="md:w-full md:justify-start"
                onClick={() => {
                  onSelect(undefined);
                  setOpen(false);
                }}
              >
                <XIcon />
                Any date
              </Button>
            ) : null}
          </div>

          <Separator orientation={isMobile ? "horizontal" : "vertical"} />

          <Calendar
            mode="range"
            // Two months side by side is how a range is picked, but only where
            // there is room: on a phone the second one would overflow the popover.
            numberOfMonths={isMobile ? 1 : 2}
            defaultMonth={range?.from}
            selected={range}
            onSelect={onSelect}
            // Nothing was asked tomorrow.
            disabled={{ after: new Date() }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Page numbers with both ends always reachable.
 *
 * A history is something people jump around in, so the first and last page stay
 * on the control however deep you are and the ellipsis absorbs the rest.
 */
function Pager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <Pagination className="mx-0 w-auto justify-end">
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            aria-label="Go to previous page"
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            <span className="hidden sm:block">Previous</span>
          </Button>
        </PaginationItem>

        {pageWindow(page, pageCount).map((entry, index) => (
          <PaginationItem key={entry === "gap" ? `gap-${index}` : entry}>
            {entry === "gap" ? (
              <PaginationEllipsis />
            ) : (
              <Button
                variant={entry === page ? "outline" : "ghost"}
                size="icon-sm"
                aria-label={`Go to page ${entry}`}
                aria-current={entry === page ? "page" : undefined}
                onClick={() => onPage(entry)}
              >
                {entry}
              </Button>
            )}
          </PaginationItem>
        ))}

        <PaginationItem>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= pageCount}
            aria-label="Go to next page"
            onClick={() => onPage(page + 1)}
          >
            <span className="hidden sm:block">Next</span>
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

/**
 * One conversation, read end to end.
 *
 * Message text is shown as written rather than rendered as markdown: this is
 * the record of what the model produced, and the chat's own prose styling is a
 * reading surface, not an auditing one.
 */
function ConversationDialog({
  chatId,
  onClose,
}: {
  chatId: string;
  onClose: () => void;
}) {
  const conversation = useQuery(trpc.history.get.queryOptions({ chatId }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {/* Padded off the close button, which the popup pins to this corner. */}
            <span className="block pr-6">
              {conversation.data?.title ?? "Conversation"}
            </span>
          </DialogTitle>
          <DialogDescription>
            {conversation.data
              ? `${conversation.data.user.name} · ${formatWhen(conversation.data.createdAt)}`
              : "Loading the transcript."}
          </DialogDescription>
        </DialogHeader>

        {conversation.isPending ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="flex max-h-96 flex-col gap-5 overflow-y-auto pr-1">
            {conversation.data?.messages.length === 0 ? (
              <p className="text-ink-03 py-6 text-center text-sm">
                This conversation was opened but never used.
              </p>
            ) : null}

            {conversation.data?.messages.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-1.5">
                <div className="text-ink-03 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-foreground font-semibold">
                    {entry.role === "user" ? "Question" : "Answer"}
                  </span>
                  <span>{formatWhen(entry.createdAt)}</span>
                  {entry.model ? <Badge variant="muted">{entry.model}</Badge> : null}
                  {entry.inputTokens !== null || entry.outputTokens !== null ? (
                    <span className="font-mono tabular-nums">
                      {`${(entry.inputTokens ?? 0) + (entry.outputTokens ?? 0)} tokens`}
                    </span>
                  ) : null}
                </div>

                <p className="text-sm leading-6 whitespace-pre-wrap">
                  {entry.content}
                </p>

                {entry.citations.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {entry.citations.map((source) => (
                      <Badge
                        key={source.id}
                        variant="outline"
                        title={source.documentTitle}
                        render={
                          source.sourceUrl ? (
                            <a
                              href={source.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            />
                          ) : undefined
                        }
                      >
                        <span className="max-w-56 truncate">
                          {`[${source.index}] ${source.documentTitle}`}
                        </span>
                        {source.sourceUrl ? (
                          <ExternalLinkIcon data-icon="inline-end" />
                        ) : null}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Midnight at the start of `date`, in the reader's timezone. */
function startOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** The last instant of `date`, so a range including today includes this minute. */
function endOfDay(date: Date | undefined) {
  if (!date) return null;
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Midnight `count` days before today. */
function daysAgo(count: number) {
  const day = startOfDay(new Date());
  day.setDate(day.getDate() - count);
  return day;
}

function formatWhen(value: Date | string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDay(value: Date) {
  return value.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function rangeLabel(range: DateRange | undefined) {
  if (!range?.from) return "Any date";
  if (!range.to || range.to.getTime() === range.from.getTime()) {
    return formatDay(range.from);
  }
  return `${formatDay(range.from)} to ${formatDay(range.to)}`;
}

/**
 * The page numbers to draw: both ends, the current page and its neighbours,
 * and a gap marker wherever a run was skipped.
 */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const wanted = new Set([1, pageCount, page, page - 1, page + 1]);
  const pages = [...wanted]
    .filter((candidate) => candidate >= 1 && candidate <= pageCount)
    .sort((a, b) => a - b);

  return pages.flatMap((entry, index) =>
    index > 0 && entry - pages[index - 1]! > 1
      ? (["gap", entry] as (number | "gap")[])
      : [entry],
  );
}
