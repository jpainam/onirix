ALTER TABLE "llm_config" ADD COLUMN "chat_models" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_config" ADD COLUMN "auto_update_models" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
-- Rows written before this column existed have a default model but no enabled
-- set; seed the set from it so they keep serving that model.
UPDATE "llm_config" SET "chat_models" = jsonb_build_array("chat_model") WHERE "chat_models" = '[]'::jsonb;
