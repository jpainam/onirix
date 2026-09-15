"use client";

import { useQuery } from "@tanstack/react-query";
import { FileTextIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@onirix/ui/components/badge";
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
  InputGroupInput,
} from "@onirix/ui/components/input-group";
import { Spinner } from "@onirix/ui/components/spinner";

import { Page, PageHeader } from "@/components/page";
import { trpc } from "@/utils/trpc";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  const results = useQuery({
    ...trpc.search.query.queryOptions({ query: trimmed, limit: 20 }),
    // Nothing to search until the user types something meaningful.
    enabled: trimmed.length > 1,
  });

  return (
    <Page>
      <PageHeader
        icon={SearchIcon}
        title="Search"
        description="Find documents directly. For an answer instead of a list, use a chat session."
      />

      <InputGroup size="lg" className="mb-6">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents, policies, projects…"
          autoFocus
        />
      </InputGroup>

      {trimmed.length <= 1 ? (
        <Empty variant="outline">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>Search your organization</EmptyTitle>
            <EmptyDescription>
              Every document your workspace has indexed is searchable here, ranked by
              how well it matches.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : results.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : results.data?.length === 0 ? (
        <Empty variant="outline">
          <EmptyHeader>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>
              Nothing in your knowledge matches “{trimmed}”.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {results.data?.map((hit) => (
            <article
              key={`${hit.documentId}-${hit.score}`}
              className="bg-card hover:bg-tint-01 flex gap-3 rounded-xl border px-4 py-3.5 transition-colors"
            >
              <FileTextIcon className="text-ink-02 mt-0.5 size-5 shrink-0" />
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold">{hit.title}</h2>
                  <Badge variant="outline" className="shrink-0">
                    {hit.sourceType}
                  </Badge>
                </div>
                <p className="text-ink-03 line-clamp-2 text-sm leading-5">
                  {hit.blurb}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </Page>
  );
}
