import type { ReleaseState } from '@caselog/schemas';

const TRANSITIONS: Record<ReleaseState, readonly ReleaseState[]> = {
  draft: ['active', 'cancelled'],
  active: ['released', 'cancelled'],
  released: [],
  cancelled: [],
};

export function canTransitionRelease(from: ReleaseState, to: ReleaseState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function isMutableReleaseState(state: ReleaseState): boolean {
  return state === 'draft' || state === 'active';
}
