import { CircleX } from "@onirix/ui/lib/icons";

/**
 * Validation messages for one form field.
 *
 * TanStack Form hands back whatever the validator threw, so entries may be
 * undefined; only ones carrying a message are rendered.
 */
export function FieldError({ errors }: { errors: Array<{ message?: string } | undefined> }) {
  return (
    <>
      {errors.map((error) =>
        error?.message ? (
          <p
            key={error.message}
            className="text-destructive flex items-center gap-1.5 text-sm"
            role="alert"
          >
            <CircleX className="size-4 shrink-0" />
            {error.message}
          </p>
        ) : null,
      )}
    </>
  );
}
