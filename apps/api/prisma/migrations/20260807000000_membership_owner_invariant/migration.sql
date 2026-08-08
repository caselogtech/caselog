CREATE UNIQUE INDEX "uq_memberships_organization_active_owner"
    ON "memberships"("organization_id")
    WHERE "role" = 'owner' AND "deleted_at" IS NULL;
