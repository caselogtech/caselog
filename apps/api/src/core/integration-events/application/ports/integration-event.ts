export type IntegrationEventJsonValue =
  | string
  | number
  | boolean
  | null
  | IntegrationEventJsonValue[]
  | { [key: string]: IntegrationEventJsonValue };

export type IntegrationEventPayload = Record<string, IntegrationEventJsonValue>;

export type IntegrationEventContract<
  Name extends string = string,
  Payload extends IntegrationEventPayload = IntegrationEventPayload,
> = {
  id: string;
  name: Name;
  schemaVersion: number;
  organizationId: string;
  source: {
    type: string;
    id: string;
    revision: string;
  };
  occurredAt: string;
  payload: Payload;
};

export type PersistedIntegrationEvent = IntegrationEventContract & {
  createdAt: string;
};
