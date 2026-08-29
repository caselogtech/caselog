import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import type { CreateProjectRequest } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, FormControlStyle, FormField } from '../../../../shared/ui/public-api';

const trimmedRequired: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() ? null : { required: true };

@Component({
  selector: 'app-project-create-form',
  imports: [Button, FormControlStyle, FormField, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './project-create-form.html',
  styleUrl: './project-create-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectCreateForm {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly pending = input(false);
  readonly submitted = output<CreateProjectRequest>();
  readonly cancelled = output<void>();
  readonly form = this.formBuilder.group({
    name: ['', [trimmedRequired, Validators.maxLength(120)]],
    key: ['', [trimmedRequired, Validators.pattern(/^\s*[A-Z][A-Z0-9_]{1,11}\s*$/)]],
    slug: [
      '',
      [
        trimmedRequired,
        Validators.maxLength(50),
        Validators.pattern(/^\s*[a-z0-9]+(?:-[a-z0-9]+)*\s*$/),
      ],
    ],
  });

  normalizeKey(): void {
    const control = this.form.controls.key;
    const normalized = control.value.toUpperCase();
    if (normalized !== control.value) control.setValue(normalized);
  }

  submit(): void {
    if (this.pending() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.submitted.emit({
      name: value.name.trim(),
      key: value.key.trim(),
      slug: value.slug.trim(),
    });
  }
}
