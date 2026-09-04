DROP TRIGGER "staff_audit_logs_immutable" ON "staff_audit_logs";
CREATE TRIGGER "staff_audit_logs_immutable"
BEFORE UPDATE OR DELETE ON "staff_audit_logs"
FOR EACH ROW EXECUTE FUNCTION caselog.reject_staff_audit_mutation();
