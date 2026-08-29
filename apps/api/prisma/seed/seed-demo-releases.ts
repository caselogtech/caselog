import type { PrismaClient } from '../../src/generated/prisma/client';
import {
  CandidateTestRunRole,
  EnvironmentState,
  EvidenceTrustLevel,
  EvidenceValueType,
  GateEvaluationDiagnostic,
  GateEvaluationResult,
  ReadinessDecisionStatus,
  ReadinessEvaluationTrigger,
  ReadinessEvidenceBehavior,
  ReadinessGateImpact,
  ReadinessGateOperator,
  ReadinessProjectionState,
  ReleasePolicyVersionState,
  ReleaseState,
} from '../../src/generated/prisma/enums';
import { DEMO_IDS, DEMO_RUNS, demoId } from './demo-fixtures';

const EVALUATOR_VERSION = '1.0.0';

export async function seedDemoReleases(
  prisma: PrismaClient,
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<void> {
  await seedEnvironments(prisma, organizationId, projectId, userId);
  await seedReleasesAndCandidates(prisma, organizationId, projectId, userId);
  await seedReadinessPolicy(prisma, organizationId, projectId, userId);
}

async function seedEnvironments(
  prisma: PrismaClient,
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<void> {
  for (const environment of [
    {
      id: DEMO_IDS.environments.staging,
      name: 'Staging',
      slug: 'staging',
      description: 'Release-candidate verification environment',
    },
    {
      id: DEMO_IDS.environments.production,
      name: 'Production',
      slug: 'production',
      description: 'Customer-facing production environment',
    },
  ]) {
    await prisma.environment.upsert({
      where: { organizationId_id: { organizationId, id: environment.id } },
      update: {
        name: environment.name,
        slug: environment.slug,
        description: environment.description,
        state: EnvironmentState.ACTIVE,
      },
      create: {
        organizationId,
        projectId,
        createdById: userId,
        state: EnvironmentState.ACTIVE,
        ...environment,
      },
    });
  }
}

async function seedReleasesAndCandidates(
  prisma: PrismaClient,
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<void> {
  const releaseDefinitions = [
    {
      id: DEMO_IDS.releases.active,
      key: 'WEB-2.4.0',
      name: 'Checkout 2.4.0',
      state: ReleaseState.ACTIVE,
      environmentId: DEMO_IDS.environments.staging,
      targetDate: new Date('2026-09-04T12:00:00.000Z'),
      createdAt: new Date('2026-08-20T08:00:00.000Z'),
      activatedAt: new Date('2026-08-24T09:00:00.000Z'),
      releasedAt: null,
    },
    {
      id: DEMO_IDS.releases.released,
      key: 'WEB-2.3.0',
      name: 'Checkout 2.3.0',
      state: ReleaseState.RELEASED,
      environmentId: DEMO_IDS.environments.production,
      targetDate: new Date('2026-08-15T12:00:00.000Z'),
      createdAt: new Date('2026-08-10T08:00:00.000Z'),
      activatedAt: new Date('2026-08-14T07:30:00.000Z'),
      releasedAt: new Date('2026-08-15T08:00:00.000Z'),
    },
    {
      id: DEMO_IDS.releases.draft,
      key: 'WEB-2.5.0',
      name: 'Checkout 2.5.0',
      state: ReleaseState.DRAFT,
      environmentId: DEMO_IDS.environments.staging,
      targetDate: new Date('2026-09-25T12:00:00.000Z'),
      createdAt: new Date('2026-08-27T08:00:00.000Z'),
      activatedAt: null,
      releasedAt: null,
    },
  ] as const;

  for (const release of releaseDefinitions) {
    await prisma.release.upsert({
      where: { organizationId_id: { organizationId, id: release.id } },
      update: {
        key: release.key,
        name: release.name,
        state: release.state,
        environmentId: release.environmentId,
        targetDate: release.targetDate,
        activatedAt: release.activatedAt,
        releasedAt: release.releasedAt,
        cancelledAt: null,
      },
      create: {
        organizationId,
        projectId,
        createdById: userId,
        externalReference: `https://github.com/caselogtech/caselog/releases/tag/${release.key}`,
        ...release,
      },
    });
  }

  const candidateDefinitions = [
    {
      id: DEMO_IDS.candidates.activeRc1,
      releaseId: DEMO_IDS.releases.active,
      sequence: 1,
      sourceRevision: '98e14f4',
      buildIdentifier: '2.4.0-rc.1',
      version: '2.4.0-rc.1',
      identityHash: 'a'.repeat(64),
      createdAt: new Date('2026-08-22T10:00:00.000Z'),
    },
    {
      id: DEMO_IDS.candidates.activeRc2,
      releaseId: DEMO_IDS.releases.active,
      sequence: 2,
      sourceRevision: 'b7c91d2',
      buildIdentifier: '2.4.0-rc.2',
      version: '2.4.0-rc.2',
      identityHash: 'b'.repeat(64),
      createdAt: new Date('2026-08-25T08:00:00.000Z'),
    },
    {
      id: DEMO_IDS.candidates.released,
      releaseId: DEMO_IDS.releases.released,
      sequence: 1,
      sourceRevision: '42d8fc1',
      buildIdentifier: '2.3.0',
      version: '2.3.0',
      identityHash: 'c'.repeat(64),
      createdAt: new Date('2026-08-14T07:00:00.000Z'),
    },
  ];

  for (const candidate of candidateDefinitions) {
    await prisma.releaseCandidate.upsert({
      where: { organizationId_id: { organizationId, id: candidate.id } },
      update: {
        sourceRevision: candidate.sourceRevision,
        buildIdentifier: candidate.buildIdentifier,
        version: candidate.version,
        branch: 'main',
        sourceUrl: `https://github.com/caselogtech/caselog/commit/${candidate.sourceRevision}`,
      },
      create: {
        organizationId,
        projectId,
        createdById: userId,
        artifactDigest: null,
        branch: 'main',
        sourceUrl: `https://github.com/caselogtech/caselog/commit/${candidate.sourceRevision}`,
        ...candidate,
      },
    });
  }

  for (const link of [
    { candidateId: DEMO_IDS.candidates.activeRc2, testRunId: DEMO_RUNS[0]?.id },
    { candidateId: DEMO_IDS.candidates.released, testRunId: DEMO_RUNS[1]?.id },
  ]) {
    if (!link.testRunId) throw new Error('Missing demo test run for release candidate');
    const testRunId = link.testRunId;
    await prisma.candidateTestRun.upsert({
      where: {
        organizationId_candidateId_testRunId: {
          organizationId,
          candidateId: link.candidateId,
          testRunId,
        },
      },
      update: { role: CandidateTestRunRole.REQUIRED },
      create: {
        organizationId,
        projectId,
        createdById: userId,
        role: CandidateTestRunRole.REQUIRED,
        candidateId: link.candidateId,
        testRunId,
      },
    });
  }

  const lifecycleEvents = [
    {
      id: demoId(431),
      releaseId: DEMO_IDS.releases.active,
      fromState: null,
      toState: ReleaseState.DRAFT,
      occurredAt: new Date('2026-08-20T08:00:00.000Z'),
    },
    {
      id: demoId(432),
      releaseId: DEMO_IDS.releases.active,
      fromState: ReleaseState.DRAFT,
      toState: ReleaseState.ACTIVE,
      occurredAt: new Date('2026-08-24T09:00:00.000Z'),
    },
    {
      id: demoId(433),
      releaseId: DEMO_IDS.releases.released,
      fromState: null,
      toState: ReleaseState.DRAFT,
      occurredAt: new Date('2026-08-10T08:00:00.000Z'),
    },
    {
      id: demoId(434),
      releaseId: DEMO_IDS.releases.released,
      fromState: ReleaseState.DRAFT,
      toState: ReleaseState.ACTIVE,
      occurredAt: new Date('2026-08-14T07:30:00.000Z'),
    },
    {
      id: demoId(435),
      releaseId: DEMO_IDS.releases.released,
      fromState: ReleaseState.ACTIVE,
      toState: ReleaseState.RELEASED,
      occurredAt: new Date('2026-08-15T08:00:00.000Z'),
    },
    {
      id: demoId(436),
      releaseId: DEMO_IDS.releases.draft,
      fromState: null,
      toState: ReleaseState.DRAFT,
      occurredAt: new Date('2026-08-27T08:00:00.000Z'),
    },
  ];
  for (const event of lifecycleEvents) {
    await prisma.releaseLifecycleEvent.upsert({
      where: { organizationId_id: { organizationId, id: event.id } },
      update: event,
      create: { organizationId, projectId, actorId: userId, ...event },
    });
  }
}

async function seedReadinessPolicy(
  prisma: PrismaClient,
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<void> {
  await prisma.releasePolicy.upsert({
    where: { organizationId_id: { organizationId, id: DEMO_IDS.policy } },
    update: {
      key: 'core-quality',
      name: 'Core quality gates',
      description: 'Minimum regression confidence required before a release can ship.',
    },
    create: {
      organizationId,
      id: DEMO_IDS.policy,
      projectId,
      key: 'core-quality',
      name: 'Core quality gates',
      description: 'Minimum regression confidence required before a release can ship.',
      createdById: userId,
    },
  });

  await prisma.releasePolicyVersion.upsert({
    where: { organizationId_id: { organizationId, id: DEMO_IDS.policyVersion } },
    update: {
      state: ReleasePolicyVersionState.PUBLISHED,
      publishedById: userId,
      publishedAt: new Date('2026-08-12T09:00:00.000Z'),
      retiredAt: null,
    },
    create: {
      organizationId,
      id: DEMO_IDS.policyVersion,
      projectId,
      policyId: DEMO_IDS.policy,
      version: 1,
      state: ReleasePolicyVersionState.PUBLISHED,
      createdById: userId,
      publishedById: userId,
      publishedAt: new Date('2026-08-12T09:00:00.000Z'),
    },
  });

  const gates = [
    {
      id: DEMO_IDS.gates.passRate,
      key: 'required-pass-rate',
      position: 0,
      metricKey: 'test.pass_rate',
      operator: ReadinessGateOperator.GTE,
      expectedPercentage: '90',
      impact: ReadinessGateImpact.BLOCKING,
    },
    {
      id: DEMO_IDS.gates.completionRate,
      key: 'required-completion',
      position: 1,
      metricKey: 'test.completion_rate',
      operator: ReadinessGateOperator.GTE,
      expectedPercentage: '100',
      impact: ReadinessGateImpact.WARNING,
    },
  ];
  for (const gate of gates) {
    await prisma.readinessGate.upsert({
      where: { organizationId_id: { organizationId, id: gate.id } },
      update: gate,
      create: {
        organizationId,
        projectId,
        policyVersionId: DEMO_IDS.policyVersion,
        metricVersion: '1.0.0',
        testRunRole: CandidateTestRunRole.REQUIRED,
        expectedValueType: EvidenceValueType.PERCENTAGE,
        expectedInteger: null,
        missingEvidenceBehavior: ReadinessEvidenceBehavior.BLOCK,
        staleEvidenceBehavior: ReadinessEvidenceBehavior.WARN,
        minimumTrust: EvidenceTrustLevel.AUTHENTICATED,
        ...gate,
      },
    });
  }

  await seedCandidateReadiness(prisma, {
    organizationId,
    projectId,
    userId,
    candidateId: DEMO_IDS.candidates.activeRc2,
    assignmentId: DEMO_IDS.assignments.active,
    decisionId: DEMO_IDS.decisions.active,
    decisionStatus: ReadinessDecisionStatus.BLOCKED,
    evaluatedAt: new Date('2026-08-27T10:20:00.000Z'),
    passRate: { result: GateEvaluationResult.FAILED, actual: '75' },
    completionRate: { result: GateEvaluationResult.WARNING, actual: '80' },
    evaluationIdOffset: 551,
  });
  await seedCandidateReadiness(prisma, {
    organizationId,
    projectId,
    userId,
    candidateId: DEMO_IDS.candidates.released,
    assignmentId: DEMO_IDS.assignments.released,
    decisionId: DEMO_IDS.decisions.released,
    decisionStatus: ReadinessDecisionStatus.READY,
    evaluatedAt: new Date('2026-08-15T07:30:00.000Z'),
    passRate: { result: GateEvaluationResult.PASSED, actual: '100' },
    completionRate: { result: GateEvaluationResult.PASSED, actual: '100' },
    evaluationIdOffset: 553,
  });
}

type CandidateReadinessSeed = {
  organizationId: string;
  projectId: string;
  userId: string;
  candidateId: string;
  assignmentId: string;
  decisionId: string;
  decisionStatus: ReadinessDecisionStatus;
  evaluatedAt: Date;
  passRate: { result: GateEvaluationResult; actual: string };
  completionRate: { result: GateEvaluationResult; actual: string };
  evaluationIdOffset: number;
};

async function seedCandidateReadiness(
  prisma: PrismaClient,
  seed: CandidateReadinessSeed,
): Promise<void> {
  await prisma.candidatePolicyAssignment.upsert({
    where: { organizationId_id: { organizationId: seed.organizationId, id: seed.assignmentId } },
    update: { assignedById: seed.userId, assignedAt: seed.evaluatedAt },
    create: {
      organizationId: seed.organizationId,
      id: seed.assignmentId,
      projectId: seed.projectId,
      candidateId: seed.candidateId,
      policyId: DEMO_IDS.policy,
      policyVersionId: DEMO_IDS.policyVersion,
      assignedById: seed.userId,
      assignedAt: seed.evaluatedAt,
    },
  });
  await prisma.currentCandidatePolicyAssignment.upsert({
    where: {
      organizationId_candidateId: {
        organizationId: seed.organizationId,
        candidateId: seed.candidateId,
      },
    },
    update: { assignmentId: seed.assignmentId },
    create: {
      organizationId: seed.organizationId,
      projectId: seed.projectId,
      candidateId: seed.candidateId,
      assignmentId: seed.assignmentId,
    },
  });
  await prisma.readinessDecision.upsert({
    where: { organizationId_id: { organizationId: seed.organizationId, id: seed.decisionId } },
    update: {
      trigger: ReadinessEvaluationTrigger.MANUAL,
      status: seed.decisionStatus,
      evaluatedById: seed.userId,
      evaluatedAt: seed.evaluatedAt,
    },
    create: {
      organizationId: seed.organizationId,
      id: seed.decisionId,
      projectId: seed.projectId,
      candidateId: seed.candidateId,
      assignmentId: seed.assignmentId,
      policyVersionId: DEMO_IDS.policyVersion,
      evidenceRevision: 0,
      evaluatorVersion: EVALUATOR_VERSION,
      trigger: ReadinessEvaluationTrigger.MANUAL,
      status: seed.decisionStatus,
      evaluatedById: seed.userId,
      evaluatedAt: seed.evaluatedAt,
    },
  });

  const evaluations = [
    {
      id: demoId(seed.evaluationIdOffset),
      gateId: DEMO_IDS.gates.passRate,
      position: 0,
      metricKey: 'test.pass_rate',
      expectedPercentage: '90',
      result: seed.passRate.result,
      actualPercentage: seed.passRate.actual,
    },
    {
      id: demoId(seed.evaluationIdOffset + 1),
      gateId: DEMO_IDS.gates.completionRate,
      position: 1,
      metricKey: 'test.completion_rate',
      expectedPercentage: '100',
      result: seed.completionRate.result,
      actualPercentage: seed.completionRate.actual,
    },
  ];
  for (const evaluation of evaluations) {
    await prisma.gateEvaluation.upsert({
      where: {
        organizationId_id: { organizationId: seed.organizationId, id: evaluation.id },
      },
      update: {
        result: evaluation.result,
        actualPercentage: evaluation.actualPercentage,
        explanationCode:
          evaluation.result === GateEvaluationResult.PASSED
            ? 'comparison_passed'
            : 'comparison_failed',
        evaluatedAt: seed.evaluatedAt,
      },
      create: {
        organizationId: seed.organizationId,
        projectId: seed.projectId,
        candidateId: seed.candidateId,
        decisionId: seed.decisionId,
        policyVersionId: DEMO_IDS.policyVersion,
        metricVersion: '1.0.0',
        dimensions: { testRunRole: 'required' },
        operator: ReadinessGateOperator.GTE,
        expectedValueType: EvidenceValueType.PERCENTAGE,
        expectedInteger: null,
        actualInteger: null,
        selectedObservationId: null,
        diagnostic: GateEvaluationDiagnostic.NONE,
        explanationCode:
          evaluation.result === GateEvaluationResult.PASSED
            ? 'comparison_passed'
            : 'comparison_failed',
        evaluatorVersion: EVALUATOR_VERSION,
        evaluatedAt: seed.evaluatedAt,
        ...evaluation,
      },
    });
  }

  await prisma.currentReadinessDecision.upsert({
    where: {
      organizationId_candidateId: {
        organizationId: seed.organizationId,
        candidateId: seed.candidateId,
      },
    },
    update: {
      assignmentId: seed.assignmentId,
      decisionId: seed.decisionId,
      targetEvidenceRevision: 0,
      targetEvaluatorVersion: EVALUATOR_VERSION,
      state: ReadinessProjectionState.CURRENT,
      failureCode: null,
    },
    create: {
      organizationId: seed.organizationId,
      projectId: seed.projectId,
      candidateId: seed.candidateId,
      assignmentId: seed.assignmentId,
      decisionId: seed.decisionId,
      targetEvidenceRevision: 0,
      targetEvaluatorVersion: EVALUATOR_VERSION,
      state: ReadinessProjectionState.CURRENT,
      failureCode: null,
    },
  });
}
