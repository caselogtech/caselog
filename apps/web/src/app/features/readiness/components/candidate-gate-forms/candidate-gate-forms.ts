import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { Button, Callout, LoadingSkeleton } from '../../../../shared/ui/public-api';
import { ReadinessApi } from '../../data-access/readiness-api';
import { GateFormResponse } from '../gate-form-response/gate-form-response';
@Component({
  selector: 'app-candidate-gate-forms',
  imports: [TranslocoPipe, Button, Callout, LoadingSkeleton, GateFormResponse],
  template: `
    @if (policy.isPending()) { <app-loading-skeleton preset="row" [label]="'readiness.forms.loading' | transloco" /> }
    @else if (policy.isError()) { <app-callout tone="danger" [title]="'readiness.forms.loadFailed' | transloco"><button appButton="secondary" type="button" (click)="policy.refetch()">{{ 'readiness.retry' | transloco }}</button></app-callout> }
    @else if (gates().length) {
      <section><h2>{{ 'readiness.forms.title' | transloco }}</h2>
        @for (gate of gates(); track gate.id) { @if (gate.form; as form) { <app-gate-form-response [workspace]="workspace()" [project]="project()" [candidate]="candidate()" [gateId]="gate.id" [definition]="form" [canManage]="canManage()" (saved)="saved.emit()" /> } }
      </section>
    }
  `,
  styles: `section { display: grid; gap: var(--space-4); } h2 { margin: 0; font-size: var(--font-size-lg); }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CandidateGateForms {
  private readonly api = inject(ReadinessApi);
  readonly workspace = input.required<string>();
  readonly project = input.required<string>();
  readonly candidate = input.required<string>();
  readonly policyId = input.required<string>();
  readonly versionId = input.required<string>();
  readonly canManage = input(false);
  readonly saved = output<void>();
  readonly policy = injectQuery(() => ({
    queryKey: ['readiness-policy', this.workspace(), this.project(), this.policyId()],
    queryFn: () => this.api.policy(this.workspace(), this.project(), this.policyId()),
  }));
  readonly gates = computed(
    () =>
      this.policy
        .data()
        ?.policy.versions.find(({ id }) => id === this.versionId())
        ?.gates.filter(({ form }) => Boolean(form)) ?? [],
  );
}
