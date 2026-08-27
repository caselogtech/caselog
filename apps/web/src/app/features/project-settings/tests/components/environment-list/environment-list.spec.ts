import { TestBed } from '@angular/core/testing';
import type { EnvironmentSummary } from '@caselog/schemas';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { EnvironmentList } from '../../../components/environment-list/environment-list';

const production: EnvironmentSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Production',
  slug: 'production',
  description: null,
  state: 'active',
  createdAt: '2026-08-20T12:00:00.000Z',
  updatedAt: '2026-08-20T12:00:00.000Z',
};

describe('EnvironmentList', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnvironmentList, i18nTestingModule()],
    }).compileComponents();
  });

  it('renders lifecycle state and emits the legal state change', () => {
    const fixture = TestBed.createComponent(EnvironmentList);
    const requested = vi.fn();
    fixture.componentRef.setInput('environments', [production]);
    fixture.componentRef.setInput('canManage', true);
    fixture.componentInstance.stateChangeRequested.subscribe(requested);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Production');
    expect(fixture.nativeElement.textContent).toContain('Active');
    fixture.componentInstance.requestStateChange(production);
    expect(requested).toHaveBeenCalledWith({
      action: 'archive',
      environment: production,
    });
  });

  it('does not emit mutations in read-only mode', () => {
    const fixture = TestBed.createComponent(EnvironmentList);
    const requested = vi.fn();
    fixture.componentRef.setInput('environments', [production]);
    fixture.componentInstance.stateChangeRequested.subscribe(requested);

    fixture.componentInstance.requestStateChange(production);
    expect(requested).not.toHaveBeenCalled();
  });
});
