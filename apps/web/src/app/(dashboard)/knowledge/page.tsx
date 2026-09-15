import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@onirix/ui/components/empty";

/** Placeholder: this area is defined in PRODUCT.md but not yet implemented. */
export default function KnowledgePage() {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle>Knowledge</EmptyTitle>
        <EmptyDescription>
          Browse what Onirix knows, organized into collections like Engineering or HR. Not built yet.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
