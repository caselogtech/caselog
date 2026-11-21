import type { ReleaseState, UpdateReleaseRequest } from '@caselog/schemas';
import { isMutableReleaseState } from './release-lifecycle.policy';

export type ReleaseUpdateSnapshot = {
  name: string;
  environmentId: string | null;
  targetDate: string | null;
  externalReference: string | null;
  state: ReleaseState;
  updatedAt: string;
};

export type ReleaseUpdatePlan =
  | { kind: 'finalized' }
  | { kind: 'stale' }
  | { kind: 'unchanged' }
  | { kind: 'update'; changedFields: string[] };

export function planReleaseUpdate(
  current: ReleaseUpdateSnapshot,
  request: UpdateReleaseRequest,
): ReleaseUpdatePlan {
  if (!isMutableReleaseState(current.state)) return { kind: 'finalized' };
  const targetDate = request.targetDate ? new Date(request.targetDate).toISOString() : null;
  const changedFields = [
    ...(current.name !== request.name ? ['name'] : []),
    ...(current.environmentId !== request.environmentId ? ['environmentId'] : []),
    ...(current.targetDate !== targetDate ? ['targetDate'] : []),
    ...(current.externalReference !== request.externalReference ? ['externalReference'] : []),
  ];
  // An identical retry is safe even when its original write advanced the timestamp.
  if (changedFields.length === 0) return { kind: 'unchanged' };
  if (current.updatedAt !== new Date(request.expectedUpdatedAt).toISOString())
    return { kind: 'stale' };
  return { kind: 'update', changedFields };
}
