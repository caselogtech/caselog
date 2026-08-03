CREATE TABLE "idempotency_records" (
    "organization_id" UUID NOT NULL,
    "scope" VARCHAR(200) NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days',

    CONSTRAINT "pk_idempotency_records" PRIMARY KEY ("organization_id", "scope", "key"),
    CONSTRAINT "chk_idempotency_records_request_hash"
        CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "chk_idempotency_records_expiry"
        CHECK ("expires_at" > "created_at")
);

CREATE INDEX "idx_idempotency_records_organization_id_expires_at"
    ON "idempotency_records"("organization_id", "expires_at");

ALTER TABLE "idempotency_records"
    ADD CONSTRAINT "idempotency_records_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "idempotency_records"
    USING (organization_id = caselog.current_organization_id())
    WITH CHECK (organization_id = caselog.current_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "idempotency_records" TO caselog_app;
