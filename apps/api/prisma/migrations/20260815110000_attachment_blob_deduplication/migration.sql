CREATE TABLE "attachment_blobs" (
    "organization_id" UUID NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_status" "attachment_storage_status" NOT NULL DEFAULT 'healthy',
    "storage_checked_at" TIMESTAMPTZ(3),
    "storage_observed_size_bytes" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pk_attachment_blobs" PRIMARY KEY ("organization_id", "checksum_sha256"),
    CONSTRAINT "uq_attachment_blobs_organization_id_storage_key"
      UNIQUE ("organization_id", "storage_key"),
    CONSTRAINT "chk_attachment_blobs_size_bytes" CHECK ("size_bytes" >= 0),
    CONSTRAINT "chk_attachment_blobs_storage_observed_size_bytes"
      CHECK ("storage_observed_size_bytes" IS NULL OR "storage_observed_size_bytes" >= 0),
    CONSTRAINT "attachment_blobs_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_attachment_blobs_organization_storage_check"
    ON "attachment_blobs"("organization_id", "storage_checked_at", "checksum_sha256");

ALTER TABLE "attachment_blobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attachment_blobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "attachment_blobs"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());
GRANT SELECT, INSERT, UPDATE, DELETE ON "attachment_blobs" TO caselog_app;

-- Prefer an active and verified reference when historical duplicate content has
-- more than one physical key. The remaining legacy objects become safe orphans
-- and are removed by the bounded storage-maintenance scan.
INSERT INTO "attachment_blobs" (
    "organization_id",
    "checksum_sha256",
    "storage_key",
    "size_bytes",
    "storage_status",
    "storage_checked_at",
    "storage_observed_size_bytes",
    "created_at"
)
SELECT DISTINCT ON ("organization_id", "checksum_sha256")
    "organization_id",
    "checksum_sha256",
    "storage_key",
    "size_bytes",
    "storage_status",
    "storage_checked_at",
    "storage_observed_size_bytes",
    "created_at"
FROM "attachments"
ORDER BY
    "organization_id",
    "checksum_sha256",
    ("deleted_at" IS NULL) DESC,
    ("storage_status" = 'healthy') DESC,
    "created_at" ASC,
    "id" ASC;

ALTER TABLE "attachments"
    ALTER COLUMN "storage_key" DROP NOT NULL,
    ADD CONSTRAINT "attachments_blob_fkey"
      FOREIGN KEY ("organization_id", "checksum_sha256")
      REFERENCES "attachment_blobs"("organization_id", "checksum_sha256")
      ON DELETE RESTRICT ON UPDATE CASCADE;

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
        SELECT 1
        FROM "attachments" AS attachment
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

DROP TRIGGER "trg_attachments_storage_usage" ON "attachments";
CREATE TRIGGER "trg_attachments_storage_usage"
AFTER INSERT OR UPDATE OF "organization_id", "checksum_sha256", "deleted_at" OR DELETE
ON "attachments"
FOR EACH ROW
EXECUTE FUNCTION "caselog"."update_attachment_storage_usage"();

CREATE TRIGGER "trg_attachment_blobs_storage_usage"
AFTER INSERT OR UPDATE OF
  "organization_id", "size_bytes", "storage_status", "storage_observed_size_bytes" OR DELETE
ON "attachment_blobs"
FOR EACH ROW
EXECUTE FUNCTION "caselog"."update_attachment_blob_storage_usage"();

REVOKE ALL ON FUNCTION "caselog"."recalculate_attachment_storage_usage"(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION "caselog"."update_attachment_blob_storage_usage"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "caselog"."recalculate_attachment_storage_usage"(UUID) TO caselog_app;
GRANT EXECUTE ON FUNCTION "caselog"."update_attachment_blob_storage_usage"() TO caselog_app;

UPDATE "usage_counters" AS counter
SET "storage_bytes_used" = totals."storage_bytes_used",
    "updated_at" = CURRENT_TIMESTAMP
FROM (
    SELECT organization."id" AS "organization_id",
           COALESCE(SUM(
             CASE
               WHEN blob."storage_status" <> 'missing'
                 THEN COALESCE(blob."storage_observed_size_bytes", blob."size_bytes")
               ELSE 0
             END
           ), 0)::BIGINT AS "storage_bytes_used"
    FROM "organizations" AS organization
    LEFT JOIN "attachment_blobs" AS blob
      ON blob."organization_id" = organization."id"
      AND EXISTS (
        SELECT 1
        FROM "attachments" AS attachment
        WHERE attachment."organization_id" = blob."organization_id"
          AND attachment."checksum_sha256" = blob."checksum_sha256"
          AND attachment."deleted_at" IS NULL
      )
    GROUP BY organization."id"
) AS totals
WHERE counter."organization_id" = totals."organization_id";
