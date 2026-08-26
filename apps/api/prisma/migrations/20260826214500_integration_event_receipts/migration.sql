CREATE TABLE "integration_event_receipts" (
    "organization_id" UUID NOT NULL,
    "consumer_name" VARCHAR(120) NOT NULL,
    "event_id" UUID NOT NULL,
    "consumed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_integration_event_receipts"
        PRIMARY KEY ("organization_id", "consumer_name", "event_id"),
    CONSTRAINT "integration_event_receipts_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "integration_event_receipts_event_fkey"
        FOREIGN KEY ("organization_id", "event_id")
        REFERENCES "integration_events"("organization_id", "id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_integration_event_receipts_org_event_consumer"
    ON "integration_event_receipts"("organization_id", "event_id", "consumer_name");

ALTER TABLE "integration_event_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_event_receipts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "integration_event_receipts"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT ON "integration_event_receipts" TO caselog_app;
