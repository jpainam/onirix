-- An answer is a sequence of parts, not a string: prose, and charts the model
-- drew by calling `render_chart`. `content` still holds the prose alone — every
-- reader that treats a message as text keeps working — and this column carries
-- the ordered parts, so reopening a conversation restores its charts.
--
-- `IF NOT EXISTS` because the column has been in the Drizzle schema since
-- before it had a migration: a database provisioned with `db:push` already has
-- it, and a plain ADD COLUMN would fail there.
ALTER TABLE "message" ADD COLUMN IF NOT EXISTS "parts" jsonb;
