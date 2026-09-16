ALTER TYPE "public"."source_type" ADD VALUE 'postgres';--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
CREATE INDEX "message_created_idx" ON "message" USING btree ("created_at");