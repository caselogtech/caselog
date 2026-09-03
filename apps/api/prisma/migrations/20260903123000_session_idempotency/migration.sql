CREATE TABLE "session_idempotency_records" (
    "user_id" UUID NOT NULL,
    "scope" VARCHAR(200) NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days',

    CONSTRAINT "pk_session_idempotency_records" PRIMARY KEY ("user_id", "scope", "key"),
    CONSTRAINT "chk_session_idempotency_records_request_hash"
        CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "chk_session_idempotency_records_expiry"
        CHECK ("expires_at" > "created_at")
);

CREATE INDEX "idx_session_idempotency_records_user_id_expires_at"
    ON "session_idempotency_records"("user_id", "expires_at");

ALTER TABLE "session_idempotency_records"
    ADD CONSTRAINT "session_idempotency_records_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "session_idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_idempotency_records" FORCE ROW LEVEL SECURITY;

CREATE POLICY "session_user_isolation" ON "session_idempotency_records"
    USING (user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID);

GRANT SELECT, INSERT, UPDATE, DELETE ON "session_idempotency_records" TO caselog_app;
