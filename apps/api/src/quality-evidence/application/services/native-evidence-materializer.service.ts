import { TestCaseScopeService } from '../../../test-cases/public-api';
import { CandidateTestScopeRepository } from '../../infrastructure/repositories/candidate-test-scope.repository';
import { buildScopedTestMetrics } from '../../domain/policies/scoped-test-metrics';
import { Inject, Injectable } from '@nestjs/common';
import type { CandidateTestRunRole } from '@caselog/schemas';
import type { ReleaseCandidateReference } from '../../../releases/public-api';
import { TestRunEvidenceSourceService } from '../../../test-runs/public-api';
import {
  buildNativeTestMetrics,
  nativeTestSourceRevision,
  NATIVE_TEST_PRODUCER,
} from '../../domain/models/native-test-metric';
import { EvidenceObservationRepository } from '../../infrastructure/repositories/evidence-observation.repository';
import type { NativeEvidenceMaterializationResult } from '../ports/native-evidence-write';

const TEST_RUN_ROLES = ['required', 'informational'] as const satisfies CandidateTestRunRole[];

@Injectable()
export class NativeEvidenceMaterializerService {
  constructor(
    @Inject(TestCaseScopeService) private readonly testCases: TestCaseScopeService,
    @Inject(CandidateTestScopeRepository) private readonly scopes: CandidateTestScopeRepository,
    @Inject(TestRunEvidenceSourceService)
    private readonly testRuns: TestRunEvidenceSourceService,
    @Inject(EvidenceObservationRepository)
    private readonly observations: EvidenceObservationRepository,
  ) {}

  async materialize(
    organizationId: string,
    candidate: ReleaseCandidateReference,
    eventIds: string[],
    triggeredAt: Date,
  ): Promise<NativeEvidenceMaterializationResult> {
    const snapshots = await Promise.all(
      candidate.testRuns.map(async (link) => ({
        role: link.role,
        snapshot: await this.testRuns.resolve(organizationId, link.testRunId),
      })),
    );
    if (snapshots.some(({ snapshot }) => snapshot.projectId !== candidate.projectId)) {
      throw new Error('Candidate test run belongs to another project');
    }

    const scope =
      (await this.scopes.load(organizationId, candidate.projectId, candidate.id)) ??
      (await this.scopes.freeze(organizationId, candidate.projectId, candidate.id, {
        capturedAt: new Date().toISOString(),
        cases: await this.testCases.capture(organizationId, candidate.projectId),
      }));
    const inputs = TEST_RUN_ROLES.flatMap((role) => {
      const roleSnapshots = snapshots
        .filter((link) => link.role === role)
        .map(({ snapshot }) => snapshot);
      const sourceRevision = nativeTestSourceRevision(candidate.identityHash, role, roleSnapshots);
      const observedAt = latestObservedAt(
        roleSnapshots.map(({ observedAt }) => observedAt),
        triggeredAt,
      );
      const expiresAt = new Date(
        observedAt.getTime() + NATIVE_TEST_PRODUCER.freshnessSeconds * 1_000,
      );
      return [
        ...buildNativeTestMetrics(role, roleSnapshots),
        ...buildScopedTestMetrics(role, roleSnapshots, scope),
      ].map((metric) => ({
        ...metric,
        role,
        sourceRevision,
        observedAt,
        expiresAt,
        idempotencyKey: `${candidate.id}:${role}:${metric.metricKey}:${sourceRevision}${metric.dimensions.minimumPriority ? `:${metric.dimensions.minimumPriority}` : ''}`,
      }));
    });

    return this.observations.appendNativeBatch({
      organizationId,
      projectId: candidate.projectId,
      candidateId: candidate.id,
      eventIds,
      observations: inputs,
    });
  }
}

function latestObservedAt(values: string[], fallback: Date): Date {
  if (values.length === 0) return fallback;
  return new Date(Math.max(...values.map((value) => new Date(value).getTime())));
}
