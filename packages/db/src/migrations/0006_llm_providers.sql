CREATE TABLE "llm_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"api_key" text,
	"base_url" text,
	"chat_models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_update_models" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_provider" ADD CONSTRAINT "llm_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "llm_provider_org_provider_uidx" ON "llm_provider" USING btree ("organization_id","provider");
--> statement-breakpoint
CREATE INDEX "llm_provider_org_idx" ON "llm_provider" USING btree ("organization_id");
--> statement-breakpoint

-- A workspace that already connected a provider keeps it: its credentials and
-- enabled models become the first row of the new table, and `llm_config` is
-- left holding only the default model pointer and the embedding half.
INSERT INTO "llm_provider" (
	"id", "organization_id", "provider", "api_key", "base_url", "chat_models", "auto_update_models", "created_at"
)
SELECT
	gen_random_uuid()::text,
	"organization_id",
	"chat_provider",
	"chat_api_key",
	"chat_base_url",
	CASE WHEN "chat_models" = '[]'::jsonb THEN jsonb_build_array("chat_model") ELSE "chat_models" END,
	"auto_update_models",
	"created_at"
FROM "llm_config";
--> statement-breakpoint

ALTER TABLE "llm_config" DROP COLUMN "chat_models";--> statement-breakpoint
ALTER TABLE "llm_config" DROP COLUMN "auto_update_models";--> statement-breakpoint
ALTER TABLE "llm_config" DROP COLUMN "chat_api_key";--> statement-breakpoint
ALTER TABLE "llm_config" DROP COLUMN "chat_base_url";
