import type {
  EvidenceListQuery,
  EvidenceMetricKey,
  EvidenceObservation,
} from '@caselog/schemas/evidence';
import type { StatusBadgeTone } from '../../../shared/ui/public-api';

export type EvidenceExplorerFilters = {
  candidateId: string;
  metricKey: EvidenceMetricKey | '';
  producerKey: string;
  sourceType: string;
  trust: EvidenceObservation['producer']['trust'] | '';
  freshness: EvidenceObservation['freshness'] | '';
  state: EvidenceObservation['state'] | '';
  currentOnly: boolean;
  observedAfter: string;
  observedBefore: string;
};

export type EvidenceExplorerState = {
  filters: EvidenceExplorerFilters;
  cursor: string | null;
};

export type EvidenceDiagnostic = {
  labelKey: string;
  descriptionKey: string;
  tone: StatusBadgeTone;
};

export const EMPTY_EVIDENCE_FILTERS: EvidenceExplorerFilters = {
  candidateId: '',
  metricKey: '',
  producerKey: '',
  sourceType: '',
  trust: '',
  freshness: '',
  state: '',
  currentOnly: true,
  observedAfter: '',
  observedBefore: '',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const METRICS: EvidenceMetricKey[] = [
  'test.pass_rate',
  'test.completion_rate',
  'test.failed_count',
];
const TRUST_LEVELS: EvidenceObservation['producer']['trust'][] = [
  'verified',
  'authenticated',
  'unverified',
];
const FRESHNESS_VALUES: EvidenceObservation['freshness'][] = ['current', 'stale'];
const OBSERVATION_STATES: EvidenceObservation['state'][] = ['available', 'incomplete'];

export function parseEvidenceExplorerState(
  get: (name: string) => string | null,
): EvidenceExplorerState {
  return {
    filters: {
      candidateId: get('candidateId')?.trim() ?? '',
      metricKey: member(get('metricKey'), METRICS),
      producerKey: get('producerKey')?.trim() ?? '',
      sourceType: get('sourceType')?.trim() ?? '',
      trust: member(get('trust'), TRUST_LEVELS),
      freshness: member(get('freshness'), FRESHNESS_VALUES),
      state: member(get('state'), OBSERVATION_STATES),
      currentOnly: get('view') !== 'history',
      observedAfter: date(get('observedAfter')),
      observedBefore: date(get('observedBefore')),
    },
    cursor: uuid(get('cursor')),
  };
}

export function evidenceExplorerQueryParams(
  filters: EvidenceExplorerFilters,
  cursor?: string | null,
): Record<string, string> {
  return compact({
    candidateId: filters.candidateId.trim(),
    metricKey: filters.metricKey,
    producerKey: filters.producerKey.trim(),
    sourceType: filters.sourceType.trim(),
    trust: filters.trust,
    freshness: filters.freshness,
    state: filters.state,
    view: filters.currentOnly ? '' : 'history',
    observedAfter: filters.observedAfter,
    observedBefore: filters.observedBefore,
    cursor: cursor ?? '',
  });
}

export function toEvidenceListQuery(
  filters: EvidenceExplorerFilters,
  cursor?: string | null,
): EvidenceListQuery {
  if (!isUuid(filters.candidateId)) throw new Error('A valid candidate ID is required');
  return {
    candidateId: filters.candidateId,
    currentOnly: filters.currentOnly,
    limit: 25,
    ...(filters.metricKey ? { metricKey: filters.metricKey } : {}),
    ...(filters.producerKey.trim() ? { producerKey: filters.producerKey.trim() } : {}),
    ...(filters.sourceType.trim() ? { sourceType: filters.sourceType.trim() } : {}),
    ...(filters.trust ? { trust: filters.trust } : {}),
    ...(filters.freshness ? { freshness: filters.freshness } : {}),
    ...(filters.state ? { state: filters.state } : {}),
    ...(filters.observedAfter ? { observedAfter: `${filters.observedAfter}T00:00:00.000Z` } : {}),
    ...(filters.observedBefore
      ? { observedBefore: `${filters.observedBefore}T23:59:59.999Z` }
      : {}),
    ...(cursor ? { cursor } : {}),
  };
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function evidenceDiagnostic(observation: EvidenceObservation): EvidenceDiagnostic {
  if (!observation.isCurrent) {
    return {
      labelKey: 'readiness.evidence.explorer.diagnostics.superseded.label',
      descriptionKey: 'readiness.evidence.explorer.diagnostics.superseded.description',
      tone: 'neutral',
    };
  }
  if (observation.state === 'incomplete') {
    return {
      labelKey: 'readiness.evidence.explorer.diagnostics.incomplete.label',
      descriptionKey: 'readiness.evidence.explorer.diagnostics.incomplete.description',
      tone: 'warning',
    };
  }
  if (observation.freshness === 'stale') {
    return {
      labelKey: 'readiness.evidence.explorer.diagnostics.stale.label',
      descriptionKey: 'readiness.evidence.explorer.diagnostics.stale.description',
      tone: 'warning',
    };
  }
  if (observation.producer.trust === 'unverified') {
    return {
      labelKey: 'readiness.evidence.explorer.diagnostics.unverified.label',
      descriptionKey: 'readiness.evidence.explorer.diagnostics.unverified.description',
      tone: 'warning',
    };
  }
  return {
    labelKey: 'readiness.evidence.explorer.diagnostics.healthy.label',
    descriptionKey: 'readiness.evidence.explorer.diagnostics.healthy.description',
    tone: 'success',
  };
}

function member<T extends string>(value: string | null, values: readonly T[]): T | '' {
  return values.includes(value as T) ? (value as T) : '';
}

function date(value: string | null): string {
  return value && DATE_PATTERN.test(value) ? value : '';
}

function uuid(value: string | null): string | null {
  return value && isUuid(value) ? value : null;
}

function compact(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
}
