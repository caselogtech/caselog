import { TestBed } from '@angular/core/testing';
import { Disclosure } from '../disclosure/disclosure';

describe('Disclosure', () => {
  it('uses native details behavior and emits the changed open state', async () => {
    await TestBed.configureTestingModule({ imports: [Disclosure] }).compileComponents();
    const fixture = TestBed.createComponent(Disclosure);
    fixture.componentRef.setInput('label', 'Evidence provenance');
    const changed = vi.fn();
    fixture.componentInstance.openChange.subscribe(changed);
    fixture.detectChanges();

    const details = fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
    const summary = fixture.nativeElement.querySelector('summary') as HTMLElement;
    expect(summary.textContent).toContain('Evidence provenance');
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    expect(changed).toHaveBeenCalledWith(true);
  });
});
