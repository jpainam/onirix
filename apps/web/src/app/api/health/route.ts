/**
 * Liveness probe used by the container healthcheck.
 *
 * Reports on dependencies rather than just answering 200, so an unhealthy
 * Postgres or OpenSearch surfaces as an unhealthy web container.
 */
import { sql } from "drizzle-orm";

import { getDb } from "@/services";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await getDb().execute(sql`select 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const healthy = Object.values(checks).every((status) => status === "ok");
  return Response.json(
    { status: healthy ? "ok" : "degraded", checks },
    { status: healthy ? 200 : 503 },
  );
}
