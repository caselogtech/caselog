import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControlStyle } from '../form-field/form-control';
import { FormField } from '../form-field/form-field';

@Component({
  imports: [FormControlStyle, FormField],
  template: `
    <app-form-field controlId="release-name" label="Name" error="Enter a release name">
      <input appControl id="release-name" aria-describedby="release-name-description" />
    </app-form-field>
  `,
})
class FormFieldHost {}

describe('FormField', () => {
  it('associates its label and error with a native input', async () => {
    await TestBed.configureTestingModule({ imports: [FormFieldHost] }).compileComponents();
    const fixture = TestBed.createComponent(FormFieldHost);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('label')?.getAttribute('for')).toBe('release-name');
    expect(host.querySelector('.error')?.id).toBe('release-name-description');
    expect(host.querySelector('input')?.classList.contains('app-control')).toBe(true);
  });
});
