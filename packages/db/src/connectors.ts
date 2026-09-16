/**
 * Connector settings at rest.
 *
 * A connector's `source.config` carries credentials: a private key, a bucket
 * secret, an app secret, a refresh token. They are sealed on the way in and
 * opened on the way out, the same way a database connection string is. What
 * counts as a secret is the connector package's knowledge, so this only
 * applies the box; `mapSecrets` knows where to apply it.
 */
import {
  type ConnectorConfig,
  connectorConfigSchema,
  mapSecrets,
} from "@onirix/connectors/config";

import type { SecretBox } from "./secrets";

/** The form a config takes in the `jsonb` column: every secret sealed. */
export function sealConnectorConfig(
  config: ConnectorConfig,
  secrets: SecretBox,
): Record<string, unknown> {
  return mapSecrets(config, (value) => secrets.seal(value));
}

/**
 * Validates the stored column into a config with its secrets opened.
 *
 * Null when the row does not parse, which the caller reports rather than
 * guesses around: a connector with half its settings is one that fails on
 * the next sync with a message nobody can act on.
 */
export function readConnectorConfig(raw: unknown, secrets: SecretBox): ConnectorConfig | null {
  const parsed = connectorConfigSchema.safeParse(raw);
  if (!parsed.success) return null;
  return mapSecrets(parsed.data, (value) => secrets.open(value));
}
