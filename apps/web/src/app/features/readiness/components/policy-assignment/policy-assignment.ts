import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ReadinessPolicySummary } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, FormControlStyle } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-policy-assignment',
  imports: [Button, FormControlStyle, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './policy-assignment.html',
  styleUrl: './policy-assignment.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PolicyAssignment {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly policies = input.required<readonly ReadinessPolicySummary[]>();
  readonly pending = input(false);
  readonly policySelected = output<string>();
  readonly publishedPolicies = computed(() =>
    this.policies().filter(({ publishedVersion }) => publishedVersion !== null),
  );
  readonly form = this.formBuilder.group({ policyId: ['', Validators.required] });

  submit(): void {
    if (this.pending() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.policySelected.emit(this.form.getRawValue().policyId);
  }
}
