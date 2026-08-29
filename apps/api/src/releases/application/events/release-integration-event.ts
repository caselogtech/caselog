import { randomUUID } from 'node:crypto';
import type { IntegrationEventContract } from '../../../core/integration-events/public-api';

export const RELEASE_INTEGRATION_EVENT = {
  environmentCreated: 'releases.environment_created',
  environmentUpdated: 'releases.environment_updated',
  environmentStateChanged: 'releases.environment_state_changed',
  releaseCreated: 'releases.release_created',
  releaseStateChanged: 'releases.release_state_changed',
  candidateCreated: 'releases.candidate_created',
  candidateTestRunLinked: 'releases.candidate_test_run_linked',
  candidateTestRunRoleChanged: 'releases.candidate_test_run_role_changed',
  candidateTestRunUnlinked: 'releases.candidate_test_run_unlinked',
} as const;

type ReleaseEventName = (typeof RELEASE_INTEGRATION_EVENT)[keyof typeof RELEASE_INTEGRATION_EVENT];

export type ReleaseIntegrationEvent = IntegrationEventContract<
  ReleaseEventName,
  Record<string, string | number | null>
>;

type EventContext = {
  organizationId: string;
  actorId: string;
  occurredAt: Date;
};

export function environmentCreatedEvent(
  context: EventContext,
  environment: {
    id: string;
    projectId: string;
    name: string;
    slug: string;
    createdAt: Date;
  },
): ReleaseIntegrationEvent {
  return event(context, RELEASE_INTEGRATION_EVENT.environmentCreated, {
    sourceType: 'environment',
    sourceId: environment.id,
    sourceRevision: environment.createdAt.toISOString(),
    payload: {
      actorId: context.actorId,
      projectId: environment.projectId,
      environmentId: environment.id,
      name: environment.name,
      slug: environment.slug,
      state: 'active',
    },
  });
}

export function environmentStateChangedEvent(
  context: EventContext,
  change: {
    environmentId: string;
    projectId: string;
    fromState: string;
    toState: string;
    sourceRevision: string;
  },
): ReleaseIntegrationEvent {
  return event(context, RELEASE_INTEGRATION_EVENT.environmentStateChanged, {
    sourceType: 'environment',
    sourceId: change.environmentId,
    sourceRevision: change.sourceRevision,
    payload: {
      actorId: context.actorId,
      projectId: change.projectId,
      environmentId: change.environmentId,
      fromState: change.fromState,
      toState: change.toState,
    },
  });
}

export function environmentUpdatedEvent(
  context: EventContext,
  environment: {
    id: string;
    projectId: string;
    name: string;
    slug: string;
    description: string | null;
    changedFields: string[];
    sourceRevision: string;
  },
): ReleaseIntegrationEvent {
  return event(context, RELEASE_INTEGRATION_EVENT.environmentUpdated, {
    sourceType: 'environment',
    sourceId: environment.id,
    sourceRevision: environment.sourceRevision,
    payload: {
      actorId: context.actorId,
      projectId: environment.projectId,
      environmentId: environment.id,
      name: environment.name,
      slug: environment.slug,
      description: environment.description,
      changedFields: environment.changedFields.join(','),
    },
  });
}

export function releaseCreatedEvent(
  context: EventContext,
  release: {
    id: string;
    projectId: string;
    environmentId: string | null;
    key: string;
    name: string;
    sourceRevision: string;
  },
): ReleaseIntegrationEvent {
  return event(context, RELEASE_INTEGRATION_EVENT.releaseCreated, {
    sourceType: 'release',
    sourceId: release.id,
    sourceRevision: release.sourceRevision,
    payload: {
      actorId: context.actorId,
      projectId: release.projectId,
      releaseId: release.id,
      environmentId: release.environmentId,
      key: release.key,
      name: release.name,
      state: 'draft',
    },
  });
}

export function releaseStateChangedEvent(
  context: EventContext,
  change: {
    releaseId: string;
    projectId: string;
    fromState: string;
    toState: string;
    sourceRevision: string;
  },
): ReleaseIntegrationEvent {
  return event(context, RELEASE_INTEGRATION_EVENT.releaseStateChanged, {
    sourceType: 'release',
    sourceId: change.releaseId,
    sourceRevision: change.sourceRevision,
    payload: {
      actorId: context.actorId,
      projectId: change.projectId,
      releaseId: change.releaseId,
      fromState: change.fromState,
      toState: change.toState,
    },
  });
}

export function candidateCreatedEvent(
  context: EventContext,
  candidate: {
    id: string;
    projectId: string;
    releaseId: string;
    sequence: number;
    identityHash: string;
    sourceRevision: string | null;
    buildIdentifier: string | null;
    artifactDigest: string | null;
  },
): ReleaseIntegrationEvent {
  return event(context, RELEASE_INTEGRATION_EVENT.candidateCreated, {
    sourceType: 'release_candidate',
    sourceId: candidate.id,
    sourceRevision: candidate.identityHash,
    payload: {
      actorId: context.actorId,
      projectId: candidate.projectId,
      releaseId: candidate.releaseId,
      candidateId: candidate.id,
      sequence: candidate.sequence,
      identityHash: candidate.identityHash,
      sourceRevision: candidate.sourceRevision,
      buildIdentifier: candidate.buildIdentifier,
      artifactDigest: candidate.artifactDigest,
    },
  });
}

export function candidateTestRunLinkedEvent(
  context: EventContext,
  link: CandidateTestRunEventInput,
): ReleaseIntegrationEvent {
  return candidateTestRunEvent(context, RELEASE_INTEGRATION_EVENT.candidateTestRunLinked, link);
}

export function candidateTestRunRoleChangedEvent(
  context: EventContext,
  link: CandidateTestRunEventInput,
): ReleaseIntegrationEvent {
  return candidateTestRunEvent(
    context,
    RELEASE_INTEGRATION_EVENT.candidateTestRunRoleChanged,
    link,
  );
}

export function candidateTestRunUnlinkedEvent(
  context: EventContext,
  link: CandidateTestRunEventInput,
): ReleaseIntegrationEvent {
  return candidateTestRunEvent(context, RELEASE_INTEGRATION_EVENT.candidateTestRunUnlinked, link);
}

type CandidateTestRunEventInput = {
  projectId: string;
  candidateId: string;
  testRunId: string;
  role: string | null;
  sourceRevision: string;
};

function candidateTestRunEvent(
  context: EventContext,
  name:
    | typeof RELEASE_INTEGRATION_EVENT.candidateTestRunLinked
    | typeof RELEASE_INTEGRATION_EVENT.candidateTestRunRoleChanged
    | typeof RELEASE_INTEGRATION_EVENT.candidateTestRunUnlinked,
  link: CandidateTestRunEventInput,
): ReleaseIntegrationEvent {
  return event(context, name, {
    sourceType: 'candidate_test_run',
    sourceId: `${link.candidateId}:${link.testRunId}`,
    sourceRevision: link.sourceRevision,
    payload: {
      actorId: context.actorId,
      projectId: link.projectId,
      candidateId: link.candidateId,
      testRunId: link.testRunId,
      role: link.role,
    },
  });
}

function event(
  context: EventContext,
  name: ReleaseEventName,
  input: {
    sourceType: string;
    sourceId: string;
    sourceRevision: string;
    payload: Record<string, string | number | null>;
  },
): ReleaseIntegrationEvent {
  return {
    id: randomUUID(),
    name,
    schemaVersion: 1,
    organizationId: context.organizationId,
    source: {
      type: input.sourceType,
      id: input.sourceId,
      revision: input.sourceRevision,
    },
    occurredAt: context.occurredAt.toISOString(),
    payload: input.payload,
  };
}
