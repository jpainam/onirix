import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@onirix/ui/components/empty";

/** Placeholder: this area is defined in PRODUCT.md but not yet implemented. */
export default function TeamPage() {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle>Team</EmptyTitle>
        <EmptyDescription>
          Invite colleagues and manage roles. Not built yet.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
