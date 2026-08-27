import type {
  ReadinessGateInput,
  ReadinessPolicy,
  ReadinessPolicySummary,
  ReadinessPolicyResponse,
} from '@caselog/schemas';
import {
  CandidateTestRunRole,
  EvidenceTrustLevel,
  EvidenceValueType,
  ReadinessEvidenceBehavior,
  ReadinessGateImpact,
  ReadinessGateOperator,
  type Prisma,
} from '../../../generated/prisma/client';

export const READINESS_POLICY_SELECTION = {
  id: true,
  projectId: true,
  key: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  versions: {
    orderBy: { version: 'desc' as const },
    select: {
      id: true,
      version: true,
      state: true,
      createdAt: true,
      publishedAt: true,
      retiredAt: true,
      gates: {
        orderBy: { position: 'asc' as const },
        select: {
          id: true,
          key: true,
          position: true,
          metricKey: true,
          metricVersion: true,
          testRunRole: true,
          operator: true,
          expectedValueType: true,
          expectedPercentage: true,
          expectedInteger: true,
          impact: true,
          missingEvidenceBehavior: true,
          staleEvidenceBehavior: true,
          minimumTrust: true,
        },
      },
    },
  },
} satisfies Prisma.ReleasePolicySelect;

export type ReadinessPolicyRecord = Prisma.ReleasePolicyGetPayload<{
  select: typeof READINESS_POLICY_SELECTION;
}>;

export const READINESS_POLICY_SUMMARY_SELECTION = {
  id: true,
  projectId: true,
  key: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  versions: {
    where: { state: { in: ['DRAFT', 'PUBLISHED'] as const } },
    orderBy: { version: 'desc' as const },
    select: {
      id: true,
      version: true,
      state: true,
      createdAt: true,
      publishedAt: true,
      _count: { select: { gates: true } },
    },
  },
} satisfies Prisma.ReleasePolicySelect;

export type ReadinessPolicySummaryRecord = Prisma.ReleasePolicyGetPayload<{
  select: typeof READINESS_POLICY_SUMMARY_SELECTION;
}>;

const TEST_RUN_ROLE = {
  required: CandidateTestRunRole.REQUIRED,
  informational: CandidateTestRunRole.INFORMATIONAL,
} as const;
const OPERATOR = {
  eq: ReadinessGateOperator.EQ,
  ne: ReadinessGateOperator.NE,
  gt: ReadinessGateOperator.GT,
  gte: ReadinessGateOperator.GTE,
  lt: ReadinessGateOperator.LT,
  lte: ReadinessGateOperator.LTE,
} as const;
const IMPACT = {
  warning: ReadinessGateImpact.WARNING,
  blocking: ReadinessGateImpact.BLOCKING,
} as const;
const BEHAVIOR = {
  unknown: ReadinessEvidenceBehavior.UNKNOWN,
  warn: ReadinessEvidenceBehavior.WARN,
  block: ReadinessEvidenceBehavior.BLOCK,
} as const;
const TRUST = {
  verified: EvidenceTrustLevel.VERIFIED,
  authenticated: EvidenceTrustLevel.AUTHENTICATED,
  unverified: EvidenceTrustLevel.UNVERIFIED,
} as const;

export function readinessGateData(input: {
  organizationId: string;
  projectId: string;
  policyVersionId: string;
  gate: ReadinessGateInput;
  position: number;
}): Prisma.ReadinessGateUncheckedCreateInput {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    policyVersionId: input.policyVersionId,
    key: input.gate.key,
    position: input.position,
    metricKey: input.gate.metricKey,
    metricVersion: input.gate.metricVersion,
    testRunRole: TEST_RUN_ROLE[input.gate.dimensions.testRunRole],
    operator: OPERATOR[input.gate.operator],
    expectedValueType:
      input.gate.expected.type === 'percentage'
        ? EvidenceValueType.PERCENTAGE
        : EvidenceValueType.INTEGER,
    expectedPercentage:
      input.gate.expected.type === 'percentage' ? input.gate.expected.value : null,
    expectedInteger: input.gate.expected.type === 'integer' ? input.gate.expected.value : null,
    impact: IMPACT[input.gate.impact],
    missingEvidenceBehavior: BEHAVIOR[input.gate.missingEvidenceBehavior],
    staleEvidenceBehavior: BEHAVIOR[input.gate.staleEvidenceBehavior],
    minimumTrust: TRUST[input.gate.minimumTrust],
  };
}

export function toReadinessPolicyResponse(record: ReadinessPolicyRecord): ReadinessPolicyResponse {
  return { policy: toReadinessPolicy(record) };
}

export function toReadinessPolicySummary(
  record: ReadinessPolicySummaryRecord,
): ReadinessPolicySummary {
  const version = (state: 'DRAFT' | 'PUBLISHED') => {
    const current = record.versions.find((item) => item.state === state);
    return current
      ? {
          id: current.id,
          version: current.version,
          state: current.state.toLowerCase() as 'draft' | 'published',
          gateCount: current._count.gates,
          createdAt: current.createdAt.toISOString(),
          publishedAt: current.publishedAt?.toISOString() ?? null,
        }
      : null;
  };
  return {
    id: record.id,
    projectId: record.projectId,
    key: record.key,
    name: record.name,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    draftVersion: version('DRAFT'),
    publishedVersion: version('PUBLISHED'),
  };
}

function toReadinessPolicy(record: ReadinessPolicyRecord): ReadinessPolicy {
  return {
    id: record.id,
    projectId: record.projectId,
    key: record.key,
    name: record.name,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    versions: record.versions.map((version) => ({
      id: version.id,
      version: version.version,
      state: version.state.toLowerCase() as ReadinessPolicy['versions'][number]['state'],
      createdAt: version.createdAt.toISOString(),
      publishedAt: version.publishedAt?.toISOString() ?? null,
      retiredAt: version.retiredAt?.toISOString() ?? null,
      gates: version.gates.map((gate) => ({
        id: gate.id,
        key: gate.key,
        position: gate.position,
        metricKey: gate.metricKey as ReadinessGateInput['metricKey'],
        metricVersion: gate.metricVersion as ReadinessGateInput['metricVersion'],
        dimensions: {
          testRunRole:
            gate.testRunRole.toLowerCase() as ReadinessGateInput['dimensions']['testRunRole'],
        },
        operator: gate.operator.toLowerCase() as ReadinessGateInput['operator'],
        expected:
          gate.expectedValueType === EvidenceValueType.PERCENTAGE
            ? {
                type: 'percentage' as const,
                value: gate.expectedPercentage?.toString() ?? '0',
              }
            : { type: 'integer' as const, value: gate.expectedInteger ?? 0 },
        impact: gate.impact.toLowerCase() as ReadinessGateInput['impact'],
        missingEvidenceBehavior:
          gate.missingEvidenceBehavior.toLowerCase() as ReadinessGateInput['missingEvidenceBehavior'],
        staleEvidenceBehavior:
          gate.staleEvidenceBehavior.toLowerCase() as ReadinessGateInput['staleEvidenceBehavior'],
        minimumTrust: gate.minimumTrust.toLowerCase() as ReadinessGateInput['minimumTrust'],
      })),
    })),
  };
}
