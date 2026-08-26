import type {
  CandidatePolicyAssignment,
  CandidatePolicyAssignmentResponse,
} from '@caselog/schemas';
import type { Prisma } from '../../../generated/prisma/client';

export const CANDIDATE_POLICY_ASSIGNMENT_SELECTION = {
  id: true,
  candidateId: true,
  assignedAt: true,
  policy: { select: { id: true, key: true, name: true } },
  policyVersion: { select: { id: true, version: true } },
} satisfies Prisma.CandidatePolicyAssignmentSelect;

export type CandidatePolicyAssignmentRecord = Prisma.CandidatePolicyAssignmentGetPayload<{
  select: typeof CANDIDATE_POLICY_ASSIGNMENT_SELECTION;
}>;

export function toCandidatePolicyAssignmentResponse(
  record: CandidatePolicyAssignmentRecord,
): CandidatePolicyAssignmentResponse {
  return { assignment: toCandidatePolicyAssignment(record) };
}

function toCandidatePolicyAssignment(
  record: CandidatePolicyAssignmentRecord,
): CandidatePolicyAssignment {
  return {
    id: record.id,
    candidateId: record.candidateId,
    policy: record.policy,
    policyVersion: record.policyVersion,
    assignedAt: record.assignedAt.toISOString(),
  };
}
