import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@onirix/ui/components/empty";

/** Placeholder: this area is defined in PRODUCT.md but not yet implemented. */
export default function AgentsPage() {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle>Agents</EmptyTitle>
        <EmptyDescription>
          Specialized assistants scoped to a subset of your knowledge. Not built yet.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
