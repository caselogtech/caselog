CREATE TABLE "integration_events" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_name" VARCHAR(120) NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "source_type" VARCHAR(80) NOT NULL,
    "source_id" VARCHAR(200) NOT NULL,
    "source_revision" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_integration_events" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_integration_events_source_revision"
        UNIQUE ("organization_id", "event_name", "source_type", "source_id", "source_revision"),
    CONSTRAINT "chk_integration_events_schema_version" CHECK ("schema_version" > 0),
    CONSTRAINT "chk_integration_events_payload_object" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "integration_events_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_integration_events_org_created_id"
    ON "integration_events"("organization_id", "created_at", "id");

CREATE FUNCTION "caselog"."prevent_integration_event_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'integration events are immutable' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER "integration_events_immutable"
BEFORE UPDATE ON "integration_events"
FOR EACH ROW EXECUTE FUNCTION "caselog"."prevent_integration_event_update"();

ALTER TABLE "integration_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "integration_events"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT ON "integration_events" TO caselog_app;
GRANT EXECUTE ON FUNCTION "caselog"."prevent_integration_event_update"() TO caselog_app;
