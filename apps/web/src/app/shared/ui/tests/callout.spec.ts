import { TestBed } from '@angular/core/testing';
import { Callout } from '../callout/callout';

describe('Callout', () => {
  it('uses an explicit live-region role only when requested', async () => {
    await TestBed.configureTestingModule({ imports: [Callout] }).compileComponents();
    const fixture = TestBed.createComponent(Callout);
    fixture.componentRef.setInput('title', 'Evaluation failed');
    fixture.componentRef.setInput('tone', 'danger');
    fixture.componentRef.setInput('liveRole', 'alert');
    fixture.detectChanges();

    const callout = fixture.nativeElement.querySelector('.callout') as HTMLElement;
    expect(callout.getAttribute('role')).toBe('alert');
    expect(callout.classList.contains('danger')).toBe(true);
    expect(callout.querySelector('strong')?.textContent).toContain('Evaluation failed');
  });
});
