CREATE OR REPLACE FUNCTION "caselog"."recalculate_attachment_storage_usage"(
    target_organization_id UUID
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    physical_bytes BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('storage-usage:' || target_organization_id::TEXT, 0)
    );
    SELECT COALESCE(SUM(
      CASE
        WHEN blob."storage_status" <> 'missing'
          THEN COALESCE(blob."storage_observed_size_bytes", blob."size_bytes")
        ELSE 0
      END
    ), 0)::BIGINT
    INTO physical_bytes
    FROM "attachment_blobs" AS blob
    WHERE blob."organization_id" = target_organization_id
      AND EXISTS (
        SELECT 1 FROM "attachments" AS attachment
        WHERE attachment."organization_id" = blob."organization_id"
          AND attachment."checksum_sha256" = blob."checksum_sha256"
          AND attachment."deleted_at" IS NULL
      );
    INSERT INTO "usage_counters" ("organization_id", "storage_bytes_used", "updated_at")
    VALUES (target_organization_id, physical_bytes, CURRENT_TIMESTAMP)
    ON CONFLICT ("organization_id") DO UPDATE
    SET "storage_bytes_used" = EXCLUDED."storage_bytes_used",
        "updated_at" = CURRENT_TIMESTAMP;
END
$$;

CREATE OR REPLACE FUNCTION "caselog"."update_attachment_storage_usage"() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_organization_id UUID;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW."organization_id" <> OLD."organization_id" THEN
        RAISE EXCEPTION 'attachment organization_id cannot be changed';
    END IF;
    target_organization_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD."organization_id"
      ELSE NEW."organization_id"
    END;
    PERFORM "caselog"."recalculate_attachment_storage_usage"(target_organization_id);
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "caselog"."update_attachment_blob_storage_usage"() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_organization_id UUID;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW."organization_id" <> OLD."organization_id" THEN
        RAISE EXCEPTION 'attachment blob organization_id cannot be changed';
    END IF;
    target_organization_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD."organization_id"
      ELSE NEW."organization_id"
    END;
    PERFORM "caselog"."recalculate_attachment_storage_usage"(target_organization_id);
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION "caselog"."recalculate_attachment_storage_usage"(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "caselog"."recalculate_attachment_storage_usage"(UUID) TO caselog_app;
