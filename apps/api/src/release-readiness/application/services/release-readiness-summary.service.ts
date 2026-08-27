import { Inject, Injectable } from '@nestjs/common';
import type {
  OrganizationAccessPrincipal,
  ReleaseReadinessListQuery,
  ReleaseReadinessListResponse,
} from '@caselog/schemas';
import { releaseReadinessListResponseSchema } from '@caselog/schemas/readiness';
import { EvidenceSnapshotService } from '../../../quality-evidence/public-api';
import { ReleaseOverviewReferenceService } from '../../../releases/public-api';
import { ReadinessDecisionQueryRepository } from '../../infrastructure/repositories/readiness-decision-query.repository';

@Injectable()
export class ReleaseReadinessSummaryService {
  constructor(
    @Inject(ReleaseOverviewReferenceService)
    private readonly releases: ReleaseOverviewReferenceService,
    @Inject(EvidenceSnapshotService)
    private readonly evidence: EvidenceSnapshotService,
    @Inject(ReadinessDecisionQueryRepository)
    private readonly readiness: ReadinessDecisionQueryRepository,
  ) {}

  async list(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    query: ReleaseReadinessListQuery,
  ): Promise<ReleaseReadinessListResponse> {
    const overview = await this.releases.list(principal.organizationId, projectSlug, query);
    const candidates = overview.items.flatMap(({ latestCandidate }) =>
      latestCandidate ? [latestCandidate] : [],
    );
    const projectId = candidates[0]?.projectId;
    const candidateIds = candidates.map(({ id }) => id);
    const revisions = projectId
      ? await this.evidence.revisions(principal.organizationId, projectId, candidateIds)
      : [];
    const summaries = projectId
      ? await this.readiness.summaries({
          organizationId: principal.organizationId,
          projectId,
          candidateIds,
          evidenceRevisions: new Map(
            revisions.map(({ candidateId, revision }) => [candidateId, revision]),
          ),
        })
      : [];
    const readinessByCandidate = new Map(
      summaries.map(({ candidateId, readiness }) => [candidateId, readiness]),
    );
    return releaseReadinessListResponseSchema.parse({
      items: overview.items.map(({ release, latestCandidate }) => ({
        release,
        latestCandidate: latestCandidate
          ? {
              id: latestCandidate.id,
              releaseId: latestCandidate.releaseId,
              sequence: latestCandidate.sequence,
              label: latestCandidate.label,
              createdAt: latestCandidate.createdAt,
            }
          : null,
        readiness: latestCandidate ? (readinessByCandidate.get(latestCandidate.id) ?? null) : null,
      })),
      nextCursor: overview.nextCursor,
    });
  }
}
