DROP INDEX "idx_custom_field_values_value";

CREATE INDEX "idx_custom_field_values_organization_id_value"
ON "custom_field_values" USING GIN ("organization_id", "value" jsonb_path_ops);
