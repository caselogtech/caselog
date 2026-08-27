import { TestBed } from '@angular/core/testing';
import { LoadingSkeleton } from '../loading-skeleton/loading-skeleton';

describe('LoadingSkeleton', () => {
  it('announces loading while keeping the visual shape content-free', async () => {
    await TestBed.configureTestingModule({ imports: [LoadingSkeleton] }).compileComponents();
    const fixture = TestBed.createComponent(LoadingSkeleton);
    fixture.componentRef.setInput('label', 'Loading releases');
    fixture.componentRef.setInput('preset', 'row');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-label')).toBe('Loading releases');
    expect(host.querySelector('.skeleton')?.classList.contains('row')).toBe(true);
  });
});
