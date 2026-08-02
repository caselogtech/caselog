-- CreateTable
CREATE TABLE "password_credentials" (
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pk_password_credentials" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revocation_reason" VARCHAR(50),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_auth_sessions_refresh_token_hash" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "uq_auth_sessions_replaced_by_id" ON "auth_sessions"("replaced_by_id");

-- CreateIndex
CREATE INDEX "idx_auth_sessions_user_id_revoked_at_expires_at" ON "auth_sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "idx_auth_sessions_family_id_revoked_at" ON "auth_sessions"("family_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "auth_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Authentication invariants that Prisma Schema cannot express.
ALTER TABLE "password_credentials"
    ADD CONSTRAINT "chk_password_credentials_argon2id" CHECK ("password_hash" LIKE '$argon2id$%');
ALTER TABLE "auth_sessions"
    ADD CONSTRAINT "chk_auth_sessions_refresh_token_hash" CHECK ("refresh_token_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "chk_auth_sessions_expiry" CHECK ("expires_at" > "created_at"),
    ADD CONSTRAINT "chk_auth_sessions_replacement" CHECK ("replaced_by_id" IS NULL OR "replaced_by_id" <> "id");
