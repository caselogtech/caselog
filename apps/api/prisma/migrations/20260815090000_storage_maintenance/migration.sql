CREATE TYPE "attachment_storage_status" AS ENUM ('healthy', 'missing', 'mismatch');

ALTER TABLE "attachments"
    ADD COLUMN "storage_status" "attachment_storage_status" NOT NULL DEFAULT 'healthy',
    ADD COLUMN "storage_checked_at" TIMESTAMPTZ(3);

CREATE INDEX "idx_attachments_organization_storage_check"
    ON "attachments"("organization_id", "storage_checked_at", "id")
    WHERE "deleted_at" IS NULL;

CREATE TABLE "storage_maintenance_cursors" (
    "organization_id" UUID NOT NULL,
    "after_key" VARCHAR(1024),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pk_storage_maintenance_cursors" PRIMARY KEY ("organization_id"),
    CONSTRAINT "storage_maintenance_cursors_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "storage_maintenance_cursors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storage_maintenance_cursors" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "storage_maintenance_cursors"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());
GRANT SELECT, INSERT, UPDATE, DELETE ON "storage_maintenance_cursors" TO caselog_app;

-- Only verified, physically present attachments count toward storage usage.
-- Reconciliation can therefore repair both health state and billing counters by
-- changing one column inside the same database invariant.
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

    IF TG_OP <> 'INSERT' AND OLD.deleted_at IS NULL AND OLD.storage_status = 'healthy' THEN
        previous_size := OLD.size_bytes;
    END IF;

    IF TG_OP <> 'DELETE' AND NEW.deleted_at IS NULL AND NEW.storage_status = 'healthy' THEN
        current_size := NEW.size_bytes;
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
AFTER INSERT OR UPDATE OF "organization_id", "size_bytes", "deleted_at", "storage_status" OR DELETE
ON "attachments"
FOR EACH ROW
EXECUTE FUNCTION "caselog"."update_attachment_storage_usage"();

INSERT INTO "usage_counters" ("organization_id", "storage_bytes_used", "updated_at")
SELECT
    organization."id",
    COALESCE(SUM(attachment."size_bytes") FILTER (
      WHERE attachment."deleted_at" IS NULL AND attachment."storage_status" = 'healthy'
    ), 0),
    CURRENT_TIMESTAMP
FROM "organizations" AS organization
LEFT JOIN "attachments" AS attachment
    ON attachment."organization_id" = organization."id"
GROUP BY organization."id"
ON CONFLICT ("organization_id") DO UPDATE
SET "storage_bytes_used" = EXCLUDED."storage_bytes_used",
    "updated_at" = CURRENT_TIMESTAMP;
