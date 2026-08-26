DROP TRIGGER "integration_events_immutable" ON "integration_events";
DROP FUNCTION "caselog"."prevent_integration_event_update"();
DROP TABLE "integration_events";
