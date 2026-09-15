CREATE TYPE "public"."document_visibility" AS ENUM('organization', 'teams', 'private');--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"team_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"membership_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_membership_key_unique" UNIQUE("membership_key")
);
--> statement-breakpoint
CREATE TABLE "document_team" (
	"document_id" text NOT NULL,
	"team_id" text NOT NULL,
	CONSTRAINT "document_team_document_id_team_id_pk" PRIMARY KEY("document_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "source_default_team" (
	"source_id" text NOT NULL,
	"team_id" text NOT NULL,
	CONSTRAINT "source_default_team_source_id_team_id_pk" PRIMARY KEY("source_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_team_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "logo" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "metadata" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "visibility" "document_visibility" DEFAULT 'organization' NOT NULL;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "default_visibility" "document_visibility" DEFAULT 'organization' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_team" ADD CONSTRAINT "document_team_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_team" ADD CONSTRAINT "document_team_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_default_team" ADD CONSTRAINT "source_default_team_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_default_team" ADD CONSTRAINT "source_default_team_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "team_org_name_uidx" ON "team" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "team_org_idx" ON "team" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_member_team_user_uidx" ON "team_member" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "team_member_user_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_team_team_idx" ON "document_team" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "source_default_team_team_idx" ON "source_default_team" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "document_org_visibility_idx" ON "document" USING btree ("organization_id","visibility");--> statement-breakpoint
-- Carry the old boolean audience over to the new three-way one. Everything
-- indexed before this migration was workspace-wide by default, so `is_public`
-- is the whole of the previous rule; anything that had been restricted becomes
-- uploader-only rather than silently staying broad.
UPDATE "document" SET "visibility" = CASE WHEN "is_public" = 'true' THEN 'organization'::"document_visibility" ELSE 'private'::"document_visibility" END;--> statement-breakpoint
-- Organization-wide documents need no tokens; restricted ones are pinned to
-- their uploader so the person who added the file does not lose it.
UPDATE "document" SET "access_control_list" = CASE WHEN "visibility" = 'organization' THEN '[]'::jsonb WHEN "uploaded_by" IS NOT NULL THEN jsonb_build_array('user:' || "uploaded_by") ELSE '[]'::jsonb END;--> statement-breakpoint
-- Better Auth reads `logo`; the column it replaces is dropped in 0003.
UPDATE "organization" SET "logo" = "logo_url" WHERE "logo_url" IS NOT NULL;
