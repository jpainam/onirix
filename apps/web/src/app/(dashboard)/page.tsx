import { redirect } from "next/navigation";

/** Chat is the primary experience, so the workspace root lands there. */
export default function DashboardRoot() {
  redirect("/chat");
}
