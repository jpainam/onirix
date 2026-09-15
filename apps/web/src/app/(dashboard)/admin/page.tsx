import { redirect } from "next/navigation";

/** The panel has no overview of its own yet; models are what setup configures. */
export default function AdminPage() {
  redirect("/admin/language-models");
}
