ALTER TABLE "chat" ALTER COLUMN "title" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "chat" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
-- Rows carrying the old placeholder are unnamed, not named "New conversation".
-- Clearing them lets a later exchange name them, and leaves the placeholder as
-- a display fallback the database never stores.
UPDATE "chat" SET "title" = NULL WHERE "title" = 'New conversation';
