import { redirect } from "next/navigation";

/** The panel has no overview of its own; it opens where the menu starts. */
export default function AdminPage() {
  redirect("/admin/general");
}
