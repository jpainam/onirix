import { expo } from "@better-auth/expo";
import type { Database } from "@onirix/db";
import * as schema from "@onirix/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
};

export function createAuth(env: AuthConfig, database: Database) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.BETTER_AUTH_URL, "onirix://", "exp://", "http://localhost:8081"],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [nextCookies(), expo()],
  });
}
