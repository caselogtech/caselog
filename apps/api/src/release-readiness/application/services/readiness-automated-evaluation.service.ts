import { Inject, Injectable } from '@nestjs/common';
import { EvidenceSnapshotService } from '../../../quality-evidence/public-api';
import { ReleaseCandidateReferenceService } from '../../../releases/public-api';
import type { ReadinessEvaluationJob } from '../../domain/models/readiness-evaluation-job';
import { evaluateReadiness } from '../../domain/policies/readiness-evaluator';
import { ReadinessDecisionRepository } from '../../infrastructure/repositories/readiness-decision.repository';
import { toReadinessEvidence } from '../mappers/readiness-evidence.mapper';

export class EvidenceRevisionPendingError extends Error {
  constructor(expected: number, actual: number) {
    super(`Evidence revision ${expected} is not available yet; current revision is ${actual}`);
    this.name = EvidenceRevisionPendingError.name;
  }
}

export type AutomatedEvaluationResult =
  | { kind: 'recorded'; decisionId: string }
  | { kind: 'obsolete' | 'unassigned' };

@Injectable()
export class ReadinessAutomatedEvaluationService {
  constructor(
    @Inject(ReleaseCandidateReferenceService)
    private readonly candidates: ReleaseCandidateReferenceService,
    @Inject(EvidenceSnapshotService)
    private readonly evidence: EvidenceSnapshotService,
    @Inject(ReadinessDecisionRepository)
    private readonly decisions: ReadinessDecisionRepository,
  ) {}

  async evaluate(job: ReadinessEvaluationJob): Promise<AutomatedEvaluationResult> {
    const candidate = await this.candidates.resolve(job.organizationId, job.candidateId);
    const context = await this.decisions.contextForCandidate({
      organizationId: job.organizationId,
      projectId: candidate.projectId,
      candidateId: candidate.id,
    });
    if (context.kind === 'assignment_not_found') return { kind: 'unassigned' };
    if (context.kind !== 'found') {
      throw new Error(`Unhandled automated readiness context result: ${context.kind}`);
    }
    if (context.value.assignment.id !== job.assignmentId) return { kind: 'obsolete' };

    const snapshot = await this.evidence.load(
      job.organizationId,
      candidate.projectId,
      candidate.id,
    );
    if (snapshot.revision < job.evidenceRevision) {
      throw new EvidenceRevisionPendingError(job.evidenceRevision, snapshot.revision);
    }
    if (snapshot.revision > job.evidenceRevision) return { kind: 'obsolete' };

    const evaluatedAt = new Date();
    const evaluation = evaluateReadiness({
      gates: context.value.gates,
      evidence: snapshot.observations.map(toReadinessEvidence),
      evaluatedAt: evaluatedAt.toISOString(),
    });
    const result = await this.decisions.record({
      organizationId: job.organizationId,
      projectId: candidate.projectId,
      candidateId: candidate.id,
      assignmentId: context.value.assignment.id,
      policyVersionId: context.value.assignment.policyVersion.id,
      evidenceRevision: snapshot.revision,
      evaluatorVersion: job.evaluatorVersion,
      evaluatedAt,
      evaluatedById: null,
      trigger: job.trigger,
      evaluation,
      gates: context.value.gates,
    });
    if (result.kind === 'assignment_changed' || result.kind === 'input_superseded') {
      return { kind: 'obsolete' };
    }
    if (result.kind !== 'found') {
      throw new Error(`Unhandled automated readiness decision result: ${result.kind}`);
    }
    const decisionId = result.value.decision?.id;
    if (!decisionId) throw new Error('Recorded readiness decision is missing from projection');
    return { kind: 'recorded', decisionId };
  }
}
