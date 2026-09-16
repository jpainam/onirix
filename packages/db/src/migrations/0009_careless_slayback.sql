ALTER TABLE "skill" ADD COLUMN "built_in_id" text;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "requires_context" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_org_built_in_uidx" ON "skill" USING btree ("organization_id","built_in_id");