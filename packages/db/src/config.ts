export type DatabaseConfig = {
  DATABASE_URL: string;
};

/** What `createSecretBox` needs: the one key that unlocks stored credentials. */
export type SecretsConfig = {
  SECRETS_ENCRYPTION_KEY: string;
};
