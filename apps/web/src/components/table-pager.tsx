"use client";

import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";

import { Button } from "@onirix/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@onirix/ui/components/input-group";
import { Spinner } from "@onirix/ui/components/spinner";

/**
 * The footer of a server-paged table: where you are, and the two ways to move.
 *
 * Previous and next only, no page numbers. A table with ten thousand rows has
 * two hundred pages, and nobody jumps to page 137; they search. The count is
 * what tells an admin the search worked.
 */
export function TablePager({
  page,
  pageSize,
  total,
  onPageChange,
  isFetching = false,
  noun = "rows",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  isFetching?: boolean;
  /** What the rows are, for "of 1,240 documents". */
  noun?: string;
}) {
  if (total === 0) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  return (
    <div className="flex items-center justify-between gap-4 px-1">
      <p className="font-figure text-ink-02 flex items-center gap-2">
        {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()} {noun}
        {isFetching ? <Spinner className="size-3" /> : null}
      </p>
      {lastPage > 0 ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
            Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            Next
            <ChevronRightIcon />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** A search box for filtering a server-paged table. Clears in one click. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onChange("")}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
