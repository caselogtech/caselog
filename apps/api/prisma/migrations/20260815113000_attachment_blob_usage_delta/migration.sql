-- Attachment writes are a hot path. Recompute-by-SUM remains available to the
-- maintenance repair job, while triggers apply O(1) first/last-reference deltas.
CREATE OR REPLACE FUNCTION "caselog"."update_attachment_storage_usage"() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_organization_id UUID;
    target_checksum CHAR(64);
    physical_size BIGINT := 0;
    size_delta BIGINT := 0;
BEGIN
    IF TG_OP = 'UPDATE' AND (
      NEW."organization_id" <> OLD."organization_id"
      OR NEW."checksum_sha256" <> OLD."checksum_sha256"
    ) THEN
        RAISE EXCEPTION 'attachment blob identity cannot be changed';
    END IF;

    target_organization_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD."organization_id"
      ELSE NEW."organization_id"
    END;
    target_checksum := CASE
      WHEN TG_OP = 'DELETE' THEN OLD."checksum_sha256"
      ELSE NEW."checksum_sha256"
    END;
    PERFORM pg_advisory_xact_lock(
      hashtextextended('storage-usage:' || target_organization_id::TEXT, 0)
    );

    SELECT CASE
      WHEN blob."storage_status" <> 'missing'
        THEN COALESCE(blob."storage_observed_size_bytes", blob."size_bytes")
      ELSE 0
    END
    INTO physical_size
    FROM "attachment_blobs" AS blob
    WHERE blob."organization_id" = target_organization_id
      AND blob."checksum_sha256" = target_checksum;

    IF TG_OP = 'INSERT' AND NEW."deleted_at" IS NULL AND NOT EXISTS (
      SELECT 1 FROM "attachments" AS attachment
      WHERE attachment."organization_id" = target_organization_id
        AND attachment."checksum_sha256" = target_checksum
        AND attachment."deleted_at" IS NULL
        AND attachment."id" <> NEW."id"
    ) THEN
        size_delta := physical_size;
    ELSIF TG_OP = 'DELETE' AND OLD."deleted_at" IS NULL AND NOT EXISTS (
      SELECT 1 FROM "attachments" AS attachment
      WHERE attachment."organization_id" = target_organization_id
        AND attachment."checksum_sha256" = target_checksum
        AND attachment."deleted_at" IS NULL
    ) THEN
        size_delta := -physical_size;
    ELSIF TG_OP = 'UPDATE' AND OLD."deleted_at" IS NULL AND NEW."deleted_at" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "attachments" AS attachment
        WHERE attachment."organization_id" = target_organization_id
          AND attachment."checksum_sha256" = target_checksum
          AND attachment."deleted_at" IS NULL
      ) THEN
        size_delta := -physical_size;
    ELSIF TG_OP = 'UPDATE' AND OLD."deleted_at" IS NOT NULL AND NEW."deleted_at" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "attachments" AS attachment
        WHERE attachment."organization_id" = target_organization_id
          AND attachment."checksum_sha256" = target_checksum
          AND attachment."deleted_at" IS NULL
          AND attachment."id" <> NEW."id"
      ) THEN
        size_delta := physical_size;
    END IF;

    IF size_delta <> 0 THEN
      INSERT INTO "usage_counters" ("organization_id", "storage_bytes_used", "updated_at")
      VALUES (target_organization_id, size_delta, CURRENT_TIMESTAMP)
      ON CONFLICT ("organization_id") DO UPDATE
      SET "storage_bytes_used" = "usage_counters"."storage_bytes_used" + size_delta,
          "updated_at" = CURRENT_TIMESTAMP;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "caselog"."update_attachment_blob_storage_usage"() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_organization_id UUID;
    previous_size BIGINT := 0;
    current_size BIGINT := 0;
    size_delta BIGINT := 0;
BEGIN
    IF TG_OP = 'UPDATE' AND (
      NEW."organization_id" <> OLD."organization_id"
      OR NEW."checksum_sha256" <> OLD."checksum_sha256"
    ) THEN
        RAISE EXCEPTION 'attachment blob identity cannot be changed';
    END IF;

    target_organization_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD."organization_id"
      ELSE NEW."organization_id"
    END;
    PERFORM pg_advisory_xact_lock(
      hashtextextended('storage-usage:' || target_organization_id::TEXT, 0)
    );

    IF EXISTS (
      SELECT 1 FROM "attachments" AS attachment
      WHERE attachment."organization_id" = target_organization_id
        AND attachment."checksum_sha256" = CASE
          WHEN TG_OP = 'DELETE' THEN OLD."checksum_sha256"
          ELSE NEW."checksum_sha256"
        END
        AND attachment."deleted_at" IS NULL
    ) THEN
      IF TG_OP <> 'INSERT' AND OLD."storage_status" <> 'missing' THEN
        previous_size := COALESCE(OLD."storage_observed_size_bytes", OLD."size_bytes");
      END IF;
      IF TG_OP <> 'DELETE' AND NEW."storage_status" <> 'missing' THEN
        current_size := COALESCE(NEW."storage_observed_size_bytes", NEW."size_bytes");
      END IF;
      size_delta := current_size - previous_size;
    END IF;

    IF size_delta <> 0 THEN
      INSERT INTO "usage_counters" ("organization_id", "storage_bytes_used", "updated_at")
      VALUES (target_organization_id, size_delta, CURRENT_TIMESTAMP)
      ON CONFLICT ("organization_id") DO UPDATE
      SET "storage_bytes_used" = "usage_counters"."storage_bytes_used" + size_delta,
          "updated_at" = CURRENT_TIMESTAMP;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
$$;

DROP FUNCTION "caselog"."recalculate_attachment_storage_usage"(UUID);
