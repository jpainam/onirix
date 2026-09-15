import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@onirix/ui/components/empty";

/** Placeholder: this area is defined in PRODUCT.md but not yet implemented. */
export default function SettingsPage() {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle>Settings</EmptyTitle>
        <EmptyDescription>
          Organization, members, AI models, privacy, and security. Not built yet.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
