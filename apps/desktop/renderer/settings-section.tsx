import type { ReactNode } from "react";

/** A titled block within a page. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-medium">{title}</h2>
        {description ? <p className="text-ink-03 text-sm">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
