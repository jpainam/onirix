import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@onirix/ui/components/avatar";

/** Two letters at most: past that, a column of initials stops being scannable. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Someone's photo, or their initials when there is none.
 *
 * Marked `alt=""` on purpose: the name is always rendered next to it, and a
 * screen reader that also announces the picture just says it twice.
 */
export function PersonAvatar({
  name,
  image,
  size = "sm",
}: {
  name: string;
  image?: string | null;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar size={size} shape="square">
      <AvatarImage src={image ?? undefined} alt="" />
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
