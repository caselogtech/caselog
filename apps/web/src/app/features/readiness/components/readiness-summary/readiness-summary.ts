import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { CandidateReadinessResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusBadge } from '../../../../shared/ui/public-api';
import {
  readinessDispositionPresentation,
  readinessProjectionPresentation,
  readinessStatusPresentation,
} from '../../domain/readiness-presentation';

@Component({
  selector: 'app-readiness-summary',
  imports: [DatePipe, StatusBadge, TranslocoPipe],
  templateUrl: './readiness-summary.html',
  styleUrl: './readiness-summary.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadinessSummary {
  readonly readiness = input.required<CandidateReadinessResponse>();

  projection() {
    return readinessProjectionPresentation(this.readiness().state);
  }

  status() {
    const decision = this.readiness().decision;
    return decision ? readinessStatusPresentation(decision.status) : null;
  }

  disposition() {
    const decision = this.readiness().decision;
    return decision ? readinessDispositionPresentation(decision.effectiveDisposition) : null;
  }
}
