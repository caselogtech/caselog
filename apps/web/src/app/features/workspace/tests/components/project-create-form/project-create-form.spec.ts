import { TestBed } from '@angular/core/testing';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { ProjectCreateForm } from '../../../components/project-create-form/project-create-form';

describe('ProjectCreateForm', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectCreateForm, i18nTestingModule()],
    }).compileComponents();
  });

  it('emits normalized project values', () => {
    const fixture = TestBed.createComponent(ProjectCreateForm);
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.form.setValue({
      name: ' Mobile App ',
      key: 'MOBILE ',
      slug: ' mobile-app ',
    });

    fixture.componentInstance.submit();

    expect(submitted).toHaveBeenCalledWith({
      name: 'Mobile App',
      key: 'MOBILE',
      slug: 'mobile-app',
    });
  });

  it('uppercases the project key while typing', () => {
    const fixture = TestBed.createComponent(ProjectCreateForm);
    fixture.componentInstance.form.controls.key.setValue('web_2');

    fixture.componentInstance.normalizeKey();

    expect(fixture.componentInstance.form.controls.key.value).toBe('WEB_2');
  });

  it('rejects invalid keys, slugs and empty names', () => {
    const fixture = TestBed.createComponent(ProjectCreateForm);
    const submitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.form.setValue({ name: ' ', key: 'A', slug: 'Mobile App' });

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.form.invalid).toBe(true);
    expect(submitted).not.toHaveBeenCalled();
  });
});
