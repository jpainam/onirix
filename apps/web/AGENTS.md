<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Design system rules

UI components come from `@onirix/ui/components` (source in `packages/ui/src/components/`).
Theme tokens are declared in `packages/ui/src/styles/globals.css`.

`@shadcn/lint` enforces the design system — pages may place and size components,
but not restyle them. After making changes, run `pnpm lint` from this directory
and fix all errors. The errors name the variant, size, or theme token to use instead.

Rules are configured in [eslint.config.mjs](./eslint.config.mjs).
