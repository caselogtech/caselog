import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ReadinessDecision } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, StatusBadge } from '../../../../shared/ui/public-api';
import {
  readinessDispositionPresentation,
  readinessStatusPresentation,
} from '../../domain/readiness-presentation';

@Component({
  selector: 'app-decision-history',
  imports: [Button, DatePipe, RouterLink, StatusBadge, TranslocoPipe],
  templateUrl: './decision-history.html',
  styleUrl: './decision-history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionHistory {
  readonly decisions = input.required<readonly ReadinessDecision[]>();
  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input.required<string>();
  readonly releaseId = input.required<string>();
  readonly candidateId = input.required<string>();
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  readonly loadMore = output<void>();

  status(decision: ReadinessDecision) {
    return readinessStatusPresentation(decision.status);
  }

  disposition(decision: ReadinessDecision) {
    return readinessDispositionPresentation(decision.effectiveDisposition);
  }

  attentionCount(decision: ReadinessDecision): number {
    return decision.gates.filter(({ result }) => result !== 'passed').length;
  }
}
