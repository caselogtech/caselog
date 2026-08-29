import { TestBed } from '@angular/core/testing';
import type { EnvironmentSettingsSummary } from '@caselog/schemas';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { EnvironmentEditForm } from '../../../components/environment-edit-form/environment-edit-form';

const production: EnvironmentSettingsSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Production',
  slug: 'production',
  description: 'Customer-facing production',
  state: 'active',
  activeReleaseCount: 2,
  createdAt: '2026-08-20T12:00:00.000Z',
  updatedAt: '2026-08-20T12:00:00.000Z',
};

describe('EnvironmentEditForm', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnvironmentEditForm, i18nTestingModule()],
    }).compileComponents();
  });

  it('starts from the selected environment and emits a full normalized snapshot', () => {
    const fixture = TestBed.createComponent(EnvironmentEditForm);
    const submitted = vi.fn();
    fixture.componentRef.setInput('environment', production);
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.detectChanges();

    expect(fixture.componentInstance.form.getRawValue()).toEqual({
      name: production.name,
      slug: production.slug,
      description: production.description,
    });
    fixture.componentInstance.form.setValue({
      name: ' Production EU ',
      slug: ' production-eu ',
      description: ' ',
    });
    fixture.componentInstance.submit();

    expect(submitted).toHaveBeenCalledWith({
      name: 'Production EU',
      slug: 'production-eu',
      description: null,
    });
  });

  it('rejects invalid edits', () => {
    const fixture = TestBed.createComponent(EnvironmentEditForm);
    const submitted = vi.fn();
    fixture.componentRef.setInput('environment', production);
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.detectChanges();
    fixture.componentInstance.form.patchValue({ name: ' ', slug: 'Production EU' });

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.form.invalid).toBe(true);
    expect(submitted).not.toHaveBeenCalled();
  });
});
