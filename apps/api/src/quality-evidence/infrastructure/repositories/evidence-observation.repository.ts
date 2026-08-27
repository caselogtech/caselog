import { Inject, Injectable } from '@nestjs/common';
import { markIntegrationEventsConsumed } from '../../../core/integration-events/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  EvidenceObservationState,
  EvidenceTrustLevel,
  EvidenceValueType,
  type Prisma,
} from '../../../generated/prisma/client';
import type {
  NativeEvidenceMaterializationInput,
  NativeEvidenceMaterializationResult,
  NativeEvidenceObservationInput,
} from '../../application/ports/native-evidence-write';
import { NATIVE_EVIDENCE_CONSUMER } from '../../application/ports/native-evidence-write';
import { candidateEvidenceRevisionAdvancedEvent } from '../../application/events/evidence-integration-event';
import { NATIVE_TEST_PRODUCER } from '../../domain/models/native-test-metric';
import { appendEvidenceIntegrationEvent } from '../persistence/evidence-integration-event.persistence';

const VALUE_TYPE = {
  percentage: EvidenceValueType.PERCENTAGE,
  integer: EvidenceValueType.INTEGER,
} as const;

const OBSERVATION_STATE = {
  available: EvidenceObservationState.AVAILABLE,
  incomplete: EvidenceObservationState.INCOMPLETE,
} as const;

@Injectable()
export class EvidenceObservationRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  appendNativeBatch(
    input: NativeEvidenceMaterializationInput,
  ): Promise<NativeEvidenceMaterializationResult> {
    return this.tenantDatabase.run(input.organizationId, async (transaction) => {
      const producer = await transaction.evidenceProducer.upsert({
        where: {
          organizationId_producerType_producerKey: {
            organizationId: input.organizationId,
            producerType: NATIVE_TEST_PRODUCER.type,
            producerKey: NATIVE_TEST_PRODUCER.key,
          },
        },
        create: {
          organizationId: input.organizationId,
          producerType: NATIVE_TEST_PRODUCER.type,
          producerKey: NATIVE_TEST_PRODUCER.key,
          schemaVersion: NATIVE_TEST_PRODUCER.schemaVersion,
          trustLevel: EvidenceTrustLevel.VERIFIED,
        },
        update: {
          schemaVersion: NATIVE_TEST_PRODUCER.schemaVersion,
          trustLevel: EvidenceTrustLevel.VERIFIED,
        },
        select: { id: true },
      });
      await transaction.candidateEvidenceRevision.upsert({
        where: {
          organizationId_candidateId: {
            organizationId: input.organizationId,
            candidateId: input.candidateId,
          },
        },
        create: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          candidateId: input.candidateId,
        },
        update: {},
      });
      const revisions = await transaction.$queryRaw<Array<{ revision: number }>>`
        SELECT revision FROM candidate_evidence_revisions
        WHERE organization_id = ${input.organizationId}::uuid
          AND candidate_id = ${input.candidateId}::uuid
        FOR UPDATE
      `;
      const currentRevision = revisions[0]?.revision ?? 0;
      const existing = await transaction.evidenceObservation.findMany({
        where: {
          producerId: producer.id,
          idempotencyKey: { in: input.observations.map(({ idempotencyKey }) => idempotencyKey) },
        },
        select: { idempotencyKey: true },
      });
      const existingKeys = new Set(existing.map(({ idempotencyKey }) => idempotencyKey));
      const pending = input.observations.filter(
        ({ idempotencyKey }) => !existingKeys.has(idempotencyKey),
      );
      if (pending.length === 0) {
        await markIntegrationEventsConsumed(transaction, {
          organizationId: input.organizationId,
          consumerName: NATIVE_EVIDENCE_CONSUMER,
          eventIds: input.eventIds,
        });
        return { revision: currentRevision, created: 0 };
      }

      const revision = currentRevision + 1;
      const current = await transaction.currentEvidenceObservation.findMany({
        where: {
          candidateId: input.candidateId,
          producerId: producer.id,
          OR: pending.map(({ metricKey, dimensionsHash }) => ({ metricKey, dimensionsHash })),
        },
        select: { metricKey: true, dimensionsHash: true, observationId: true },
      });
      const currentByKey = new Map(
        current.map((record) => [key(record.metricKey, record.dimensionsHash), record]),
      );

      for (const observation of pending) {
        const previous = currentByKey.get(key(observation.metricKey, observation.dimensionsHash));
        const created = await transaction.evidenceObservation.create({
          data: observationData(input, producer.id, observation, previous?.observationId),
          select: { id: true },
        });
        await transaction.currentEvidenceObservation.upsert({
          where: {
            organizationId_candidateId_producerId_metricKey_dimensionsHash: {
              organizationId: input.organizationId,
              candidateId: input.candidateId,
              producerId: producer.id,
              metricKey: observation.metricKey,
              dimensionsHash: observation.dimensionsHash,
            },
          },
          create: {
            organizationId: input.organizationId,
            projectId: input.projectId,
            candidateId: input.candidateId,
            producerId: producer.id,
            metricKey: observation.metricKey,
            dimensionsHash: observation.dimensionsHash,
            observationId: created.id,
            evidenceRevision: revision,
          },
          update: { observationId: created.id, evidenceRevision: revision },
        });
      }
      await transaction.candidateEvidenceRevision.update({
        where: {
          organizationId_candidateId: {
            organizationId: input.organizationId,
            candidateId: input.candidateId,
          },
        },
        data: { revision },
      });
      await appendEvidenceIntegrationEvent(
        transaction,
        candidateEvidenceRevisionAdvancedEvent({
          organizationId: input.organizationId,
          projectId: input.projectId,
          candidateId: input.candidateId,
          evidenceRevision: revision,
          occurredAt: new Date(),
        }),
      );
      await markIntegrationEventsConsumed(transaction, {
        organizationId: input.organizationId,
        consumerName: NATIVE_EVIDENCE_CONSUMER,
        eventIds: input.eventIds,
      });
      return { revision, created: pending.length };
    });
  }
}

function observationData(
  input: NativeEvidenceMaterializationInput,
  producerId: string,
  observation: NativeEvidenceObservationInput,
  supersedesObservationId: string | undefined,
): Prisma.EvidenceObservationUncheckedCreateInput {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    candidateId: input.candidateId,
    metricKey: observation.metricKey,
    metricVersion: observation.metricVersion,
    producerId,
    producerSchemaVersion: NATIVE_TEST_PRODUCER.schemaVersion,
    valueType: VALUE_TYPE[observation.valueType],
    state: OBSERVATION_STATE[observation.state],
    percentageValue: observation.percentageValue,
    integerValue: observation.integerValue,
    dimensions: observation.dimensions,
    dimensionsHash: observation.dimensionsHash,
    observedAt: observation.observedAt,
    expiresAt: observation.expiresAt,
    trustLevel: EvidenceTrustLevel.VERIFIED,
    sourceType: 'release_candidate_test_runs',
    sourceId: `${input.candidateId}:${observation.role}`,
    sourceRevision: observation.sourceRevision,
    idempotencyKey: observation.idempotencyKey,
    supersedesObservationId,
    payload: observation.payload,
  };
}

function key(metricKey: string, dimensionsHash: string): string {
  return `${metricKey}:${dimensionsHash}`;
}
