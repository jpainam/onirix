/**
 * Seals credentials written before encryption existed.
 *
 * Idempotent: a value already carrying the `enc:v1:` prefix is left alone, so
 * this can run on every deploy. It touches three places: provider API keys,
 * the embedding key copied onto the model configuration, and the connection
 * URL inside each `postgres` source's config. Run it once after setting
 * `SECRETS_ENCRYPTION_KEY`; from then on every writer seals as it goes.
 *
 *   pnpm --filter @onirix/db db:encrypt-secrets
 */
import { eq } from "drizzle-orm";

import { ENV } from "./env";
import { createDb } from "./index";
import { llmConfig, llmProvider, source } from "./schema";
import { createSecretBox } from "./secrets";

const db = createDb(ENV);
const secrets = createSecretBox(ENV.SECRETS_ENCRYPTION_KEY);

let sealed = 0;
let skipped = 0;

function sealIfPlain(value: string | null): string | null {
  if (value === null || value.length === 0) return value;
  if (secrets.isSealed(value)) {
    skipped += 1;
    return value;
  }
  sealed += 1;
  return secrets.seal(value);
}

for (const row of await db.select().from(llmProvider)) {
  const next = sealIfPlain(row.apiKey);
  if (next !== row.apiKey) {
    await db.update(llmProvider).set({ apiKey: next }).where(eq(llmProvider.id, row.id));
  }
}

for (const row of await db.select().from(llmConfig)) {
  const next = sealIfPlain(row.embeddingApiKey);
  if (next !== row.embeddingApiKey) {
    await db.update(llmConfig).set({ embeddingApiKey: next }).where(eq(llmConfig.id, row.id));
  }
}

for (const row of await db.select().from(source).where(eq(source.type, "postgres"))) {
  const config = row.config as { connectionUrl?: unknown };
  if (typeof config.connectionUrl !== "string") continue;
  const next = sealIfPlain(config.connectionUrl);
  if (next !== config.connectionUrl) {
    await db
      .update(source)
      .set({ config: { ...config, connectionUrl: next } })
      .where(eq(source.id, row.id));
  }
}

console.log(`[db] secrets sealed: ${sealed}, already sealed: ${skipped}`);
process.exit(0);
