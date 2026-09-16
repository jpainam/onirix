ALTER TYPE "public"."source_type" ADD VALUE 's3' BEFORE 'postgres';--> statement-breakpoint
ALTER TYPE "public"."sync_status" ADD VALUE 'queued' BEFORE 'in_progress';--> statement-breakpoint
CREATE TABLE "source_sync_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source_id" text NOT NULL,
	"status" "sync_status" NOT NULL,
	"requested_by" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"error" text,
	"notes" text,
	"documents_seen" integer DEFAULT 0 NOT NULL,
	"documents_added" integer DEFAULT 0 NOT NULL,
	"documents_updated" integer DEFAULT 0 NOT NULL,
	"documents_removed" integer DEFAULT 0 NOT NULL,
	"documents_unchanged" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "last_sync_run_id" text;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "sync_interval_minutes" integer;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "source_sync_run" ADD CONSTRAINT "source_sync_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_sync_run" ADD CONSTRAINT "source_sync_run_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_sync_run" ADD CONSTRAINT "source_sync_run_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_sync_run_source_idx" ON "source_sync_run" USING btree ("source_id","created_at");--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_source_external_uidx" ON "document" USING btree ("source_id","external_id");