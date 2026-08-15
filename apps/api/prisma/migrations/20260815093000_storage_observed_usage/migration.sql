ALTER TABLE "attachments"
    ADD COLUMN "storage_observed_size_bytes" BIGINT;

ALTER TABLE "attachments"
    ADD CONSTRAINT "chk_attachments_storage_observed_size_bytes"
    CHECK ("storage_observed_size_bytes" IS NULL OR "storage_observed_size_bytes" >= 0);

-- The per-workspace advisory lock serializes trigger deltas with periodic SUM
-- reconciliation. Without it, a repair statement waiting on usage_counters could
-- overwrite a concurrent attachment increment using an older statement snapshot.
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

DROP TRIGGER "trg_attachments_storage_usage" ON "attachments";
CREATE TRIGGER "trg_attachments_storage_usage"
AFTER INSERT OR UPDATE OF "organization_id", "size_bytes", "deleted_at", "storage_status", "storage_observed_size_bytes" OR DELETE
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
    LEFT JOIN "attachments" AS attachment ON attachment."organization_id" = organization."id"
    GROUP BY organization."id"
) AS totals
WHERE counter."organization_id" = totals."organization_id";
