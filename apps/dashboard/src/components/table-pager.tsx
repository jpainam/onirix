"use client";

import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";

import { Button } from "@onirix/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@onirix/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@onirix/ui/components/select";
import { Spinner } from "@onirix/ui/components/spinner";

/** The page sizes a pager offers when the table lets the reader pick one. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * The footer of a server-paged table: where you are, and the two ways to move.
 *
 * Previous and next only, no page numbers. A table with ten thousand rows has
 * two hundred pages, and nobody jumps to page 137; they search. The count is
 * what tells an admin the search worked. The controls stay on screen even on
 * a single page, so a table that will grow looks paged from the first row.
 */
export function TablePager({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  isFetching = false,
  noun = "rows",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Given, a rows-per-page picker joins the footer. The table resets to page 0 itself. */
  onPageSizeChange?: (pageSize: number) => void;
  isFetching?: boolean;
  /** What the rows are, for "of 1,240 documents". */
  noun?: string;
}) {
  if (total === 0) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const lastPage = pageCount - 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
      <p className="font-figure text-ink-02 flex items-center gap-2">
        {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()} {noun}
        {isFetching ? <Spinner className="size-3" /> : null}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {onPageSizeChange ? (
          <label className="text-ink-02 flex items-center gap-2 text-sm">
            Rows per page
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger size="sm" aria-label="Rows per page" className="w-18">
                <SelectValue>{pageSize}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
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
          <span className="font-figure text-ink-02 px-1 text-sm">
            Page {(page + 1).toLocaleString()} of {pageCount.toLocaleString()}
          </span>
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
      </div>
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
