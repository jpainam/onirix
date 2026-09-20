import type { PropsWithChildren } from "react";

import { requireWorkspace } from "@/lib/workspace";

/**
 * The settings panel shares the dashboard shell so the sidebar can slide between
 * its two menus instead of remounting, but every page under it needs a
 * configured workspace — the guard lives here rather than in each page.
 */
export default async function AdminLayout(props: PropsWithChildren) {
  await requireWorkspace();

  return props.children;
}
