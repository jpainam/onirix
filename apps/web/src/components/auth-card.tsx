import type { ReactNode } from "react";

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
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <div className="bg-card w-full max-w-md space-y-6 rounded-xl border p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="text-muted-foreground text-sm">{subtitle}</p> : null}
        </div>
        {children}
      </div>
      {footer ? <div className="text-muted-foreground text-sm">{footer}</div> : null}
    </div>
  );
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}
