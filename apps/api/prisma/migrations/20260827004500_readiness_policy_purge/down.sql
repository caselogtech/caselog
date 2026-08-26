DROP TRIGGER "readiness_gates_guard_update" ON "readiness_gates";
CREATE TRIGGER "readiness_gates_guard_update"
BEFORE UPDATE OR DELETE ON "readiness_gates"
FOR EACH ROW EXECUTE FUNCTION "caselog"."guard_readiness_gate_mutation"();
