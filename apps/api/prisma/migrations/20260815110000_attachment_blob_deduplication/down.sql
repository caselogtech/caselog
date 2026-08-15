-- This rollback is intentionally fail-closed after the new application has
-- created blob-only references. Run the documented storage expansion procedure
-- before rolling back application and schema versions with such rows present.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "attachments" WHERE "storage_key" IS NULL) THEN
        RAISE EXCEPTION
          'attachment blob rollback requires expanding blob-only references to legacy objects first';
    END IF;
END
$$;

DROP TRIGGER IF EXISTS "trg_attachment_blobs_storage_usage" ON "attachment_blobs";
DROP TRIGGER IF EXISTS "trg_attachments_storage_usage" ON "attachments";
DROP FUNCTION IF EXISTS "caselog"."update_attachment_blob_storage_usage"();
DROP FUNCTION IF EXISTS "caselog"."recalculate_attachment_storage_usage"(UUID);

ALTER TABLE "attachments" DROP CONSTRAINT "attachments_blob_fkey";
ALTER TABLE "attachments" ALTER COLUMN "storage_key" SET NOT NULL;

DROP TABLE "attachment_blobs";

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
    PERFORM pg_advisory_xact_lock(hashtextextended('storage-usage:' || target_organization_id::TEXT, 0));

    IF TG_OP <> 'INSERT' AND OLD.deleted_at IS NULL AND OLD.storage_status <> 'missing' THEN
        previous_size := COALESCE(OLD.storage_observed_size_bytes, OLD.size_bytes);
    END IF;

    IF TG_OP <> 'DELETE' AND NEW.deleted_at IS NULL AND NEW.storage_status <> 'missing' THEN
        current_size := COALESCE(NEW.storage_observed_size_bytes, NEW.size_bytes);
    END IF;

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
AFTER INSERT OR UPDATE OF
  "organization_id", "size_bytes", "deleted_at", "storage_status", "storage_observed_size_bytes"
  OR DELETE
ON "attachments"
FOR EACH ROW
EXECUTE FUNCTION "caselog"."update_attachment_storage_usage"();

UPDATE "usage_counters" AS counter
SET "storage_bytes_used" = totals."storage_bytes_used",
    "updated_at" = CURRENT_TIMESTAMP
FROM (
    SELECT organization."id" AS "organization_id",
           COALESCE(SUM(
             CASE
               WHEN attachment."deleted_at" IS NULL AND attachment."storage_status" <> 'missing'
                 THEN COALESCE(attachment."storage_observed_size_bytes", attachment."size_bytes")
               ELSE 0
             END
           ), 0) AS "storage_bytes_used"
    FROM "organizations" AS organization
    LEFT JOIN "attachments" AS attachment
      ON attachment."organization_id" = organization."id"
    GROUP BY organization."id"
) AS totals
WHERE counter."organization_id" = totals."organization_id";
