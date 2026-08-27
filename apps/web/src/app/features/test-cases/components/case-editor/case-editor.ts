import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  type OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import type { ProjectStructureResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, FormControlStyle, FormField } from '../../../../shared/ui/public-api';
import {
  createCaseStepForm,
  type CaseEditorForm,
  updateCaseEditorValidators,
} from './case-editor-form';

@Component({
  selector: 'app-case-editor',
  imports: [Button, FormControlStyle, FormField, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './case-editor.html',
  styleUrl: './case-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseEditor implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly form = input.required<CaseEditorForm>();
  readonly suites = input.required<ProjectStructureResponse['suites']>();
  readonly idPrefix = input('case-editor');

  ngOnInit(): void {
    const form = this.form();
    updateCaseEditorValidators(form, form.controls.template.value);
    form.controls.template.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((template) => updateCaseEditorValidators(form, template));
  }

  addStep(): void {
    const steps = this.form().controls.steps;
    steps.push(createCaseStepForm(this.formBuilder));
    steps.markAsDirty();
  }

  removeStep(index: number): void {
    const steps = this.form().controls.steps;
    if (steps.length === 1) return;
    steps.removeAt(index);
    steps.markAsDirty();
  }
}
