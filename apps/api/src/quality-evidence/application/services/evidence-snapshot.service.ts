import { Inject, Injectable } from '@nestjs/common';
import type { CandidateEvidenceSnapshot } from '../ports/candidate-evidence-snapshot';
import { EvidenceSnapshotRepository } from '../../infrastructure/repositories/evidence-snapshot.repository';

@Injectable()
export class EvidenceSnapshotService {
  constructor(
    @Inject(EvidenceSnapshotRepository)
    private readonly snapshots: EvidenceSnapshotRepository,
  ) {}

  load(
    organizationId: string,
    projectId: string,
    candidateId: string,
  ): Promise<CandidateEvidenceSnapshot> {
    return this.snapshots.load(organizationId, projectId, candidateId);
  }
}
