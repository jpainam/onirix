import type { ReactNode } from "react"

/** The quiet bordered surface a settings page uses for tiles and lists. */
export const TILE = "rounded-xl border bg-card"

/** A titled block within a settings page. */
export function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-medium">{title}</h2>
        {description ? (
          <p className="text-sm text-ink-03">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/**
 * A settings page's heading: the title, an optional lead sentence under it,
 * and an action on the far side. No glyph and no rule: the sidebar row already
 * carries the icon, and space closes the block.
 */
export function PageHeading({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="flex w-full items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-medium tracking-display">{title}</h1>
        {description ? <p className="mt-2 text-ink-03">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

/**
 * One line of a settings tile: what it is on the left, the control on the
 * right. Rows sit inside a `TILE` that divides them.
 */
export function Row({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-14 items-center gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm">{title}</span>
        {description ? (
          <span className="text-xs text-ink-03 select-text">{description}</span>
        ) : null}
      </div>
      {children}
    </div>
  )
}
