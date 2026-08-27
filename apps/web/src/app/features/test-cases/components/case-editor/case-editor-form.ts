import {
  type AbstractControl,
  type FormArray,
  type FormControl,
  type FormGroup,
  type NonNullableFormBuilder,
  Validators,
} from '@angular/forms';
import type { TestCaseTemplate } from '@caselog/schemas';

export type CaseStepForm = FormGroup<{
  action: FormControl<string>;
  expected: FormControl<string>;
}>;

export type CaseEditorForm = FormGroup<{
  title: FormControl<string>;
  sectionId: FormControl<string>;
  template: FormControl<TestCaseTemplate>;
  automationId: FormControl<string>;
  preconditions: FormControl<string>;
  expectedResult: FormControl<string>;
  text: FormControl<string>;
  charter: FormControl<string>;
  gherkin: FormControl<string>;
  steps: FormArray<CaseStepForm>;
}>;

export function createCaseEditorForm(formBuilder: NonNullableFormBuilder): CaseEditorForm {
  return formBuilder.group({
    title: ['', [Validators.required, Validators.maxLength(500)]],
    sectionId: ['', Validators.required],
    template: formBuilder.control<TestCaseTemplate>('steps'),
    automationId: ['', Validators.maxLength(500)],
    preconditions: ['', Validators.maxLength(50_000)],
    expectedResult: ['', Validators.maxLength(50_000)],
    text: ['', Validators.maxLength(50_000)],
    charter: ['', Validators.maxLength(50_000)],
    gherkin: ['', Validators.maxLength(50_000)],
    steps: formBuilder.array([createCaseStepForm(formBuilder)]),
  });
}

export function createCaseStepForm(
  formBuilder: NonNullableFormBuilder,
  action = '',
  expected = '',
): CaseStepForm {
  return formBuilder.group({
    action: [action, [Validators.required, Validators.maxLength(10_000)]],
    expected: [expected, Validators.maxLength(10_000)],
  });
}

export function updateCaseEditorValidators(form: CaseEditorForm, template: TestCaseTemplate): void {
  const contentControls: AbstractControl[] = [
    form.controls.text,
    form.controls.charter,
    form.controls.gherkin,
    ...form.controls.steps.controls.map((step) => step.controls.action),
  ];
  for (const control of contentControls) {
    control.removeValidators(Validators.required);
  }

  if (template === 'steps') {
    for (const step of form.controls.steps.controls) {
      step.controls.action.addValidators(Validators.required);
    }
  } else if (template === 'text') {
    form.controls.text.addValidators(Validators.required);
  } else if (template === 'exploratory') {
    form.controls.charter.addValidators(Validators.required);
  } else {
    form.controls.gherkin.addValidators(Validators.required);
  }

  for (const control of contentControls) {
    control.updateValueAndValidity({ emitEvent: false });
  }
}
