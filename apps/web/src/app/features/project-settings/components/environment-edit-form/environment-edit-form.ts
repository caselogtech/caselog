import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import type { EnvironmentSettingsSummary, UpdateEnvironmentRequest } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, FormControlStyle, FormField } from '../../../../shared/ui/public-api';

const trimmedRequired: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };

@Component({
  selector: 'app-environment-edit-form',
  imports: [Button, FormControlStyle, FormField, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './environment-edit-form.html',
  styleUrl: './environment-edit-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentEditForm {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly environment = input.required<EnvironmentSettingsSummary>();
  readonly pending = input(false);
  readonly submitted = output<UpdateEnvironmentRequest>();
  readonly cancelled = output<void>();
  readonly form = this.formBuilder.group({
    name: ['', [trimmedRequired, Validators.maxLength(120)]],
    slug: [
      '',
      [
        trimmedRequired,
        Validators.maxLength(50),
        Validators.pattern(/^\s*[a-z0-9]+(?:-[a-z0-9]+)*\s*$/),
      ],
    ],
    description: ['', Validators.maxLength(2_000)],
  });

  constructor() {
    effect(() => {
      const environment = this.environment();
      this.form.setValue({
        name: environment.name,
        slug: environment.slug,
        description: environment.description ?? '',
      });
    });
  }

  submit(): void {
    if (this.pending() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.submitted.emit({
      name: value.name.trim(),
      slug: value.slug.trim(),
      description: value.description.trim() || null,
    });
  }
}
