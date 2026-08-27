import { TestBed } from '@angular/core/testing';
import { NonNullableFormBuilder } from '@angular/forms';
import type { ProjectStructureResponse } from '@caselog/schemas';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { CaseEditor } from '../../../components/case-editor/case-editor';
import { createCaseEditorForm } from '../../../components/case-editor/case-editor-form';

const suites: ProjectStructureResponse['suites'] = [
  {
    id: '275823d3-8b7d-4772-8f07-a597bd07426c',
    name: 'Authentication',
    position: 0,
    sections: [
      {
        id: 'cc4201aa-51f1-4a1b-898d-8d208d475ed3',
        parentId: null,
        name: 'Sign in',
        depth: 0,
        position: 0,
      },
    ],
  },
];

describe('CaseEditor', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CaseEditor, i18nTestingModule()],
    }).compileComponents();
  });

  it('switches required content validation with the selected template', () => {
    const form = createCaseEditorForm(TestBed.inject(NonNullableFormBuilder));
    const fixture = TestBed.createComponent(CaseEditor);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('suites', suites);
    fixture.detectChanges();

    form.controls.template.setValue('text');
    form.controls.text.markAsTouched();
    fixture.detectChanges();

    expect(form.controls.text.hasError('required')).toBe(true);
    expect(form.controls.steps.at(0).controls.action.hasError('required')).toBe(false);
    expect(fixture.nativeElement.querySelector('#case-editor-text')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Enter the test description',
    );
  });

  it('marks structural step changes as unsaved form input', () => {
    const form = createCaseEditorForm(TestBed.inject(NonNullableFormBuilder));
    const fixture = TestBed.createComponent(CaseEditor);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('suites', suites);
    fixture.detectChanges();

    fixture.componentInstance.addStep();

    expect(form.controls.steps.length).toBe(2);
    expect(form.controls.steps.dirty).toBe(true);

    fixture.componentInstance.removeStep(1);
    expect(form.controls.steps.length).toBe(1);
  });
});
