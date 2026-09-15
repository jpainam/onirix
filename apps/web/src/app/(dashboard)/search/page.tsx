"use client";

import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@onirix/ui/components/badge";
import { Card, CardContent } from "@onirix/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@onirix/ui/components/empty";
import { Input } from "@onirix/ui/components/input";
import { Spinner } from "@onirix/ui/components/spinner";

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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search documents, policies, projects..."
        autoFocus
      />

      {trimmed.length <= 1 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>Search your organization</EmptyTitle>
            <EmptyDescription>
              Find documents directly. For an answer instead of a list, use Chat.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : results.isPending ? (
        <Spinner />
      ) : results.data?.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>Nothing in your knowledge matches “{trimmed}”.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {results.data?.map((hit) => (
            <Card key={`${hit.documentId}-${hit.score}`}>
              <CardContent className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{hit.title}</span>
                  <Badge variant="outline">{hit.sourceType}</Badge>
                </div>
                <p className="text-muted-foreground text-sm">{hit.blurb}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
