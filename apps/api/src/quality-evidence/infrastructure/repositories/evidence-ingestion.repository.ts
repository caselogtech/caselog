import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EvidenceIngestRequest } from '@caselog/schemas';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../../core/database/application/services/tenant-database.service';
import {
  EvidenceObservationState,
  EvidenceTrustLevel,
  EvidenceValueType,
  type Prisma,
} from '../../../generated/prisma/client';
import { candidateEvidenceRevisionAdvancedEvent } from '../../application/events/evidence-integration-event';
import type {
  EvidenceIngestionInput,
  EvidenceIngestionResult,
} from '../../application/ports/evidence-ingestion';
import {
  EVIDENCE_OBSERVATION_SELECTION,
  toEvidenceObservation,
} from '../persistence/evidence-observation.persistence';
import { appendEvidenceIntegrationEvent } from '../persistence/evidence-integration-event.persistence';

@Injectable()
export class EvidenceIngestionRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  ingest(input: EvidenceIngestionInput): Promise<EvidenceIngestionResult> {
    return this.tenantDatabase.run(input.organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: {
          organizationId_slug: {
            organizationId: input.organizationId,
            slug: input.projectSlug,
          },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const candidate = await transaction.releaseCandidate.findFirst({
        where: { id: input.request.candidateId, projectId: project.id },
        select: { id: true },
      });
      if (!candidate) return { kind: 'candidate_not_found' };

      const producer = await transaction.evidenceProducer.upsert({
        where: {
          organizationId_producerType_producerKey: {
            organizationId: input.organizationId,
            producerType: input.producer.type,
            producerKey: input.producer.key,
          },
        },
        create: {
          organizationId: input.organizationId,
          producerType: input.producer.type,
          producerKey: input.producer.key,
          schemaVersion: input.producer.schemaVersion,
          trustLevel: EvidenceTrustLevel.AUTHENTICATED,
        },
        update: {
          schemaVersion: input.producer.schemaVersion,
          trustLevel: EvidenceTrustLevel.AUTHENTICATED,
        },
        select: { id: true },
      });
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM evidence_producers
        WHERE organization_id = ${input.organizationId}::uuid
          AND id = ${producer.id}::uuid
        FOR UPDATE
      `;

      await transaction.candidateEvidenceRevision.upsert({
        where: {
          organizationId_candidateId: {
            organizationId: input.organizationId,
            candidateId: candidate.id,
          },
        },
        create: {
          organizationId: input.organizationId,
          projectId: project.id,
          candidateId: candidate.id,
        },
        update: {},
      });
      const revisionRows = await transaction.$queryRaw<Array<{ revision: number }>>`
        SELECT revision FROM candidate_evidence_revisions
        WHERE organization_id = ${input.organizationId}::uuid
          AND candidate_id = ${candidate.id}::uuid
        FOR UPDATE
      `;
      const currentRevision = revisionRows[0]?.revision ?? 0;

      const existing = await transaction.evidenceObservation.findUnique({
        where: {
          organizationId_producerId_idempotencyKey: {
            organizationId: input.organizationId,
            producerId: producer.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: { requestHash: true, ...EVIDENCE_OBSERVATION_SELECTION },
      });
      if (existing) {
        if (existing.requestHash !== input.requestHash) return { kind: 'idempotency_conflict' };
        return {
          kind: 'found',
          value: {
            observation: toEvidenceObservation(existing),
            candidateRevision: currentRevision,
            replayed: true,
          },
        };
      }

      const dimensionsHash = hashDimensions(input.request);
      const current = await transaction.currentEvidenceObservation.findUnique({
        where: {
          organizationId_candidateId_producerId_metricKey_dimensionsHash: {
            organizationId: input.organizationId,
            candidateId: candidate.id,
            producerId: producer.id,
            metricKey: input.request.metricKey,
            dimensionsHash,
          },
        },
        select: {
          observationId: true,
          observation: { select: { observedAt: true } },
        },
      });
      const correction = await this.resolveCorrection(
        transaction,
        input,
        producer.id,
        project.id,
        dimensionsHash,
        current?.observationId,
      );
      if (correction.kind !== 'valid') return correction;

      const observedAt = new Date(input.request.observedAt);
      const becomesCurrent =
        correction.observationId !== null ||
        current === null ||
        observedAt > current.observation.observedAt;
      const revision = becomesCurrent ? currentRevision + 1 : currentRevision;
      const created = await transaction.evidenceObservation.create({
        data: observationData(
          input,
          project.id,
          producer.id,
          dimensionsHash,
          correction.observationId,
        ),
        select: { id: true },
      });

      if (becomesCurrent) {
        await transaction.currentEvidenceObservation.upsert({
          where: {
            organizationId_candidateId_producerId_metricKey_dimensionsHash: {
              organizationId: input.organizationId,
              candidateId: candidate.id,
              producerId: producer.id,
              metricKey: input.request.metricKey,
              dimensionsHash,
            },
          },
          create: {
            organizationId: input.organizationId,
            projectId: project.id,
            candidateId: candidate.id,
            producerId: producer.id,
            metricKey: input.request.metricKey,
            dimensionsHash,
            observationId: created.id,
            evidenceRevision: revision,
          },
          update: { observationId: created.id, evidenceRevision: revision },
        });
        await transaction.candidateEvidenceRevision.update({
          where: {
            organizationId_candidateId: {
              organizationId: input.organizationId,
              candidateId: candidate.id,
            },
          },
          data: { revision },
        });
        await appendEvidenceIntegrationEvent(
          transaction,
          candidateEvidenceRevisionAdvancedEvent({
            organizationId: input.organizationId,
            projectId: project.id,
            candidateId: candidate.id,
            evidenceRevision: revision,
            occurredAt: new Date(),
          }),
        );
      }

      const record = await transaction.evidenceObservation.findUniqueOrThrow({
        where: {
          organizationId_id: { organizationId: input.organizationId, id: created.id },
        },
        select: EVIDENCE_OBSERVATION_SELECTION,
      });
      return {
        kind: 'found',
        value: {
          observation: toEvidenceObservation(record),
          candidateRevision: revision,
          replayed: false,
        },
      };
    });
  }

  private async resolveCorrection(
    transaction: TenantTransaction,
    input: EvidenceIngestionInput,
    producerId: string,
    projectId: string,
    dimensionsHash: string,
    currentObservationId: string | undefined,
  ): Promise<
    | { kind: 'valid'; observationId: string | null }
    | { kind: 'superseded_observation_not_found' | 'supersession_conflict' }
  > {
    const supersededId = input.request.supersedesObservationId;
    if (!supersededId) return { kind: 'valid', observationId: null };
    const superseded = await transaction.evidenceObservation.findFirst({
      where: { id: supersededId, projectId, candidateId: input.request.candidateId },
      select: { id: true, producerId: true, metricKey: true, dimensionsHash: true },
    });
    if (!superseded) return { kind: 'superseded_observation_not_found' };
    if (
      superseded.producerId !== producerId ||
      superseded.metricKey !== input.request.metricKey ||
      superseded.dimensionsHash !== dimensionsHash ||
      currentObservationId !== superseded.id
    ) {
      return { kind: 'supersession_conflict' };
    }
    return { kind: 'valid', observationId: superseded.id };
  }
}

function observationData(
  input: EvidenceIngestionInput,
  projectId: string,
  producerId: string,
  dimensionsHash: string,
  supersedesObservationId: string | null,
): Prisma.EvidenceObservationUncheckedCreateInput {
  const percentageValue =
    input.request.value.type === 'percentage' ? input.request.value.value : null;
  const integerValue = input.request.value.type === 'integer' ? input.request.value.value : null;
  return {
    organizationId: input.organizationId,
    projectId,
    candidateId: input.request.candidateId,
    metricKey: input.request.metricKey,
    metricVersion: input.request.metricVersion,
    producerId,
    producerSchemaVersion: input.producer.schemaVersion,
    valueType:
      input.request.value.type === 'percentage'
        ? EvidenceValueType.PERCENTAGE
        : EvidenceValueType.INTEGER,
    state:
      input.request.state === 'available'
        ? EvidenceObservationState.AVAILABLE
        : EvidenceObservationState.INCOMPLETE,
    percentageValue,
    integerValue,
    dimensions: input.request.dimensions,
    dimensionsHash,
    observedAt: new Date(input.request.observedAt),
    expiresAt: new Date(input.request.expiresAt),
    trustLevel: EvidenceTrustLevel.AUTHENTICATED,
    sourceType: input.request.source.type,
    sourceId: input.request.source.id,
    sourceRevision: input.request.source.revision,
    sourceUrl: input.request.source.url,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    supersedesObservationId,
    payload: input.request.details as Prisma.InputJsonObject,
  };
}

function hashDimensions(request: EvidenceIngestRequest): string {
  return createHash('sha256').update(JSON.stringify(request.dimensions)).digest('hex');
}
