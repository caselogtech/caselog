import { TestBed } from '@angular/core/testing';
import { StatusBadge } from '../status-badge/status-badge';

describe('StatusBadge', () => {
  it('communicates status with text and a decorative icon', async () => {
    await TestBed.configureTestingModule({ imports: [StatusBadge] }).compileComponents();
    const fixture = TestBed.createComponent(StatusBadge);
    fixture.componentRef.setInput('label', 'Blocked');
    fixture.componentRef.setInput('tone', 'danger');
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.badge') as HTMLElement;
    expect(badge.classList.contains('danger')).toBe(true);
    expect(badge.textContent).toContain('Blocked');
    expect(badge.querySelector('svg.icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(badge.querySelectorAll('svg.icon path')).toHaveLength(1);
  });
});
