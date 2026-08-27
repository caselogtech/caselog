import { TestBed } from '@angular/core/testing';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { EnvironmentCreateForm } from '../../../components/environment-create-form/environment-create-form';

describe('EnvironmentCreateForm', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnvironmentCreateForm, i18nTestingModule()],
    }).compileComponents();
  });

  it('emits normalized environment values', () => {
    const fixture = TestBed.createComponent(EnvironmentCreateForm);
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.form.setValue({
      name: ' Production ',
      slug: ' production-eu ',
      description: ' Customer-facing production ',
    });

    fixture.componentInstance.submit();

    expect(submitted).toHaveBeenCalledWith({
      name: 'Production',
      slug: 'production-eu',
      description: 'Customer-facing production',
    });
  });

  it('rejects invalid slugs and empty names', () => {
    const fixture = TestBed.createComponent(EnvironmentCreateForm);
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.form.patchValue({ name: ' ', slug: 'Production EU' });

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.form.invalid).toBe(true);
    expect(submitted).not.toHaveBeenCalled();
  });
});
