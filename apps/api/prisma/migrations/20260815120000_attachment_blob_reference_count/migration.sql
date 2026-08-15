ALTER TABLE "attachment_blobs"
    ADD COLUMN "active_reference_count" INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT "chk_attachment_blobs_active_reference_count"
      CHECK ("active_reference_count" >= 0);

UPDATE "attachment_blobs" AS blob
SET "active_reference_count" = reference_counts."active_reference_count"
FROM (
  SELECT "organization_id", "checksum_sha256", COUNT(*)::INTEGER AS "active_reference_count"
  FROM "attachments"
  WHERE "deleted_at" IS NULL
  GROUP BY "organization_id", "checksum_sha256"
) AS reference_counts
WHERE blob."organization_id" = reference_counts."organization_id"
  AND blob."checksum_sha256" = reference_counts."checksum_sha256";

CREATE OR REPLACE FUNCTION "caselog"."update_attachment_storage_usage"() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_organization_id UUID;
    target_checksum CHAR(64);
    reference_delta INTEGER := 0;
    reference_count INTEGER;
    physical_size BIGINT;
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

    IF TG_OP = 'INSERT' AND NEW."deleted_at" IS NULL THEN
      reference_delta := 1;
    ELSIF TG_OP = 'DELETE' AND OLD."deleted_at" IS NULL THEN
      reference_delta := -1;
    ELSIF TG_OP = 'UPDATE' AND OLD."deleted_at" IS NULL AND NEW."deleted_at" IS NOT NULL THEN
      reference_delta := -1;
    ELSIF TG_OP = 'UPDATE' AND OLD."deleted_at" IS NOT NULL AND NEW."deleted_at" IS NULL THEN
      reference_delta := 1;
    END IF;

    IF reference_delta = 0 THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('storage-usage:' || target_organization_id::TEXT, 0)
    );
    UPDATE "attachment_blobs" AS blob
    SET "active_reference_count" = blob."active_reference_count" + reference_delta
    WHERE blob."organization_id" = target_organization_id
      AND blob."checksum_sha256" = target_checksum
    RETURNING
      blob."active_reference_count",
      CASE
        WHEN blob."storage_status" <> 'missing'
          THEN COALESCE(blob."storage_observed_size_bytes", blob."size_bytes")
        ELSE 0
      END
    INTO reference_count, physical_size;

    IF reference_count < 0 THEN
      RAISE EXCEPTION 'attachment blob reference count cannot be negative';
    END IF;
    IF reference_delta = 1 AND reference_count = 1 THEN
      size_delta := physical_size;
    ELSIF reference_delta = -1 AND reference_count = 0 THEN
      size_delta := -physical_size;
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

    IF (
      CASE WHEN TG_OP = 'DELETE' THEN OLD."active_reference_count"
           ELSE NEW."active_reference_count" END
    ) > 0 THEN
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
