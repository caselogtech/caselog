-- CreateEnum
CREATE TYPE "account_token_purpose" AS ENUM ('email_verification', 'password_reset');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "account_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "purpose" "account_token_purpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_account_tokens_token_hash" ON "account_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_account_tokens_user_purpose_created_at" ON "account_tokens"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "idx_account_tokens_expires_at" ON "account_tokens"("expires_at");

-- Only one unconsumed token of each purpose is valid per user. Issuing a new token
-- first revokes the previous one, which also makes resend deterministic under concurrency.
CREATE UNIQUE INDEX "uq_account_tokens_active_user_purpose"
ON "account_tokens"("user_id", "purpose")
WHERE "consumed_at" IS NULL AND "revoked_at" IS NULL;

-- AddForeignKey
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_tokens"
    ADD CONSTRAINT "chk_account_tokens_token_hash" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "chk_account_tokens_expiry" CHECK ("expires_at" > "created_at"),
    ADD CONSTRAINT "chk_account_tokens_terminal_state" CHECK ("consumed_at" IS NULL OR "revoked_at" IS NULL),
    ADD CONSTRAINT "chk_account_tokens_consumed_at" CHECK ("consumed_at" IS NULL OR "consumed_at" >= "created_at"),
    ADD CONSTRAINT "chk_account_tokens_revoked_at" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at");
