import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ReadinessPolicy } from '@caselog/schemas/readiness';
import { TranslocoPipe } from '@jsverse/transloco';
import { Disclosure, StatusBadge, type StatusBadgeTone } from '../../../../shared/ui/public-api';
import { PolicyGateList } from '../policy-gate-list/policy-gate-list';

type ReadinessPolicyVersion = ReadinessPolicy['versions'][number];

const STATE_LABEL: Record<ReadinessPolicyVersion['state'], string> = {
  draft: 'readiness.policies.states.draft',
  published: 'readiness.policies.states.published',
  retired: 'readiness.policies.states.retired',
};

@Component({
  selector: 'app-policy-version-list',
  imports: [DatePipe, Disclosure, PolicyGateList, StatusBadge, TranslocoPipe],
  templateUrl: './policy-version-list.html',
  styleUrl: './policy-version-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PolicyVersionList {
  readonly versions = input.required<ReadonlyArray<ReadinessPolicyVersion>>();

  stateTone(state: ReadinessPolicyVersion['state']): StatusBadgeTone {
    if (state === 'published') return 'success';
    if (state === 'draft') return 'pending';
    return 'neutral';
  }

  stateLabel(state: ReadinessPolicyVersion['state']): string {
    return STATE_LABEL[state];
  }
}
