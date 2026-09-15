import type { ReactNode } from "react";

import { OnirixWordmark } from "@/components/onirix-mark";

/** The centered panel every auth screen renders inside. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="bg-card shadow-lg w-full max-w-104 space-y-6 rounded-2xl border p-8">
        <div className="space-y-4">
          <OnirixWordmark />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-heading">{title}</h1>
            {subtitle ? <p className="text-ink-03 text-sm">{subtitle}</p> : null}
          </div>
        </div>
        {children}
      </div>
      {footer ? <div className="text-ink-03 text-sm">{footer}</div> : null}
    </div>
  );
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-border h-px flex-1" />
      <span className="text-ink-02 text-xs">{label}</span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}
