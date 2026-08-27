import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Button } from '../button/button';

@Component({
  imports: [Button],
  template: `<button appButton="primary" type="button">Create release</button>`,
})
class ButtonHost {}

describe('Button', () => {
  it('applies one semantic visual variant to a native control', async () => {
    await TestBed.configureTestingModule({ imports: [ButtonHost] }).compileComponents();
    const fixture = TestBed.createComponent(ButtonHost);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.type).toBe('button');
    expect(button.classList.contains('app-button')).toBe(true);
    expect(button.classList.contains('app-button-primary')).toBe(true);
  });
});
