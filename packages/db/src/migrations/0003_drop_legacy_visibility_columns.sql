-- Better Auth writes `member.role` as free text: its dynamic roles and
-- multi-role members store values ("admin,moderator") that an enum rejects.
-- The default has to go first — Postgres cannot cast an enum-typed default to
-- text on its own, and the ALTER fails outright if it is still attached.
ALTER TABLE "member" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "role" SET DATA TYPE text USING "role"::text;--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "role" SET DEFAULT 'member';--> statement-breakpoint
-- Superseded by `logo` and `visibility`, both populated in 0002.
ALTER TABLE "organization" DROP COLUMN "logo_url";--> statement-breakpoint
ALTER TABLE "document" DROP COLUMN "is_public";--> statement-breakpoint
DROP TYPE "public"."member_role";
