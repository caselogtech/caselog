DROP TRIGGER IF EXISTS "staff_audit_logs_immutable" ON "staff_audit_logs";
DROP FUNCTION IF EXISTS caselog.reject_staff_audit_mutation();

-- Ordering is API-compatible and intentionally remains newest-first after rollback.
