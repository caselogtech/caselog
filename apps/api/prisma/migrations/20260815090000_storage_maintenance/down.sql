DROP TRIGGER IF EXISTS "trg_attachments_storage_usage" ON "attachments";

CREATE OR REPLACE FUNCTION "caselog"."update_attachment_storage_usage"() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_organization_id UUID;
    previous_size BIGINT := 0;
    current_size BIGINT := 0;
    size_delta BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.organization_id <> OLD.organization_id THEN
        RAISE EXCEPTION 'attachment organization_id cannot be changed';
    END IF;
    target_organization_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
    IF TG_OP <> 'INSERT' AND OLD.deleted_at IS NULL THEN previous_size := OLD.size_bytes; END IF;
    IF TG_OP <> 'DELETE' AND NEW.deleted_at IS NULL THEN current_size := NEW.size_bytes; END IF;
    size_delta := current_size - previous_size;
    IF size_delta = 0 THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    INSERT INTO "usage_counters" ("organization_id", "storage_bytes_used", "updated_at")
    VALUES (target_organization_id, 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("organization_id") DO NOTHING;
    UPDATE "usage_counters"
    SET "storage_bytes_used" = "storage_bytes_used" + size_delta,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "organization_id" = target_organization_id;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER "trg_attachments_storage_usage"
AFTER INSERT OR UPDATE OF "organization_id", "size_bytes", "deleted_at" OR DELETE
ON "attachments"
FOR EACH ROW
EXECUTE FUNCTION "caselog"."update_attachment_storage_usage"();

UPDATE "usage_counters" AS counter
SET "storage_bytes_used" = totals."storage_bytes_used",
    "updated_at" = CURRENT_TIMESTAMP
FROM (
    SELECT organization."id" AS "organization_id",
           COALESCE(SUM(attachment."size_bytes") FILTER (WHERE attachment."deleted_at" IS NULL), 0) AS "storage_bytes_used"
    FROM "organizations" AS organization
    LEFT JOIN "attachments" AS attachment ON attachment."organization_id" = organization."id"
    GROUP BY organization."id"
) AS totals
WHERE counter."organization_id" = totals."organization_id";

DROP TABLE IF EXISTS "storage_maintenance_cursors";
DROP INDEX IF EXISTS "idx_attachments_organization_storage_check";
ALTER TABLE "attachments"
    DROP COLUMN IF EXISTS "storage_checked_at",
    DROP COLUMN IF EXISTS "storage_status";
DROP TYPE IF EXISTS "attachment_storage_status";
