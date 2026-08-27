import type {
  ReadinessEffectiveDisposition,
  ReleaseReadinessListResponse,
  ReleaseState,
} from '@caselog/schemas';
import type { StatusBadgeTone } from '../../../shared/ui/public-api';

export type ReleaseListItem = ReleaseReadinessListResponse['items'][number];

export interface StatusPresentation {
  labelKey: string;
  tone: StatusBadgeTone;
}

export type ReleaseLifecycleAction = 'activate' | 'release' | 'cancel';

const ACTIONS: Record<ReleaseState, readonly ReleaseLifecycleAction[]> = {
  draft: ['activate', 'cancel'],
  active: ['release', 'cancel'],
  released: [],
  cancelled: [],
};

const LIFECYCLE: Record<ReleaseState, StatusPresentation> = {
  draft: { labelKey: 'releases.lifecycle.draft', tone: 'neutral' },
  active: { labelKey: 'releases.lifecycle.active', tone: 'pending' },
  released: { labelKey: 'releases.lifecycle.released', tone: 'success' },
  cancelled: { labelKey: 'releases.lifecycle.cancelled', tone: 'danger' },
};

const DISPOSITION: Record<ReadinessEffectiveDisposition, StatusPresentation> = {
  ready: { labelKey: 'releases.readiness.ready', tone: 'success' },
  at_risk: { labelKey: 'releases.readiness.atRisk', tone: 'warning' },
  blocked: { labelKey: 'releases.readiness.blocked', tone: 'danger' },
  unknown: { labelKey: 'releases.readiness.unknown', tone: 'unknown' },
  approved_with_waiver: {
    labelKey: 'releases.readiness.approvedWithWaiver',
    tone: 'warning',
  },
};

export function releaseLifecyclePresentation(state: ReleaseState): StatusPresentation {
  return LIFECYCLE[state];
}

export function releaseReadinessPresentation(item: ReleaseListItem): StatusPresentation {
  if (!item.latestCandidate) {
    return { labelKey: 'releases.readiness.noCandidate', tone: 'neutral' };
  }

  if (!item.readiness) {
    return { labelKey: 'releases.readiness.noPolicy', tone: 'neutral' };
  }

  switch (item.readiness.state) {
    case 'pending':
      return { labelKey: 'releases.readiness.pending', tone: 'pending' };
    case 'stale':
      return { labelKey: 'releases.readiness.stale', tone: 'warning' };
    case 'failed':
      return { labelKey: 'releases.readiness.evaluationFailed', tone: 'danger' };
    case 'current':
      return item.readiness.effectiveDisposition
        ? DISPOSITION[item.readiness.effectiveDisposition]
        : { labelKey: 'releases.readiness.unknown', tone: 'unknown' };
  }
}

export function releaseLifecycleActions(state: ReleaseState): readonly ReleaseLifecycleAction[] {
  return ACTIONS[state];
}
