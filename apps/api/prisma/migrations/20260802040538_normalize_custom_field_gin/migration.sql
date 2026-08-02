-- DropIndex
DROP INDEX "idx_custom_field_values_organization_id_value";

-- CreateIndex
CREATE INDEX "idx_custom_field_values_value" ON "custom_field_values" USING GIN ("value" jsonb_path_ops);
