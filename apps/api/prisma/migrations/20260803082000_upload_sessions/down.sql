DROP TABLE IF EXISTS "upload_sessions";

ALTER TABLE "attachments"
    DROP CONSTRAINT IF EXISTS "chk_attachments_step_position",
    DROP COLUMN IF EXISTS "step_position";
