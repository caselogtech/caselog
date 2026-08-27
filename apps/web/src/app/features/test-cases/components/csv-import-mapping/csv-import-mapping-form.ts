import { type NonNullableFormBuilder, Validators } from '@angular/forms';
import type { TestCaseTemplate } from '@caselog/schemas';

export function createCsvImportMappingForm(formBuilder: NonNullableFormBuilder) {
  return formBuilder.group({
    title: ['', Validators.required],
    content: ['', Validators.required],
    sectionId: [''],
    template: [''],
    automationId: [''],
    preconditions: [''],
    expectedResult: [''],
    defaultSectionId: ['', Validators.required],
    defaultTemplate: formBuilder.control<TestCaseTemplate>('steps'),
  });
}

export type CsvImportMappingForm = ReturnType<typeof createCsvImportMappingForm>;
