import { TestBed } from '@angular/core/testing';
import type { EnvironmentSettingsSummary } from '@caselog/schemas';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { EnvironmentList } from '../../../components/environment-list/environment-list';

const production: EnvironmentSettingsSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Production',
  slug: 'production',
  description: null,
  state: 'active',
  activeReleaseCount: 2,
  createdAt: '2026-08-20T12:00:00.000Z',
  updatedAt: '2026-08-20T12:00:00.000Z',
};

describe('EnvironmentList', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnvironmentList, i18nTestingModule()],
    }).compileComponents();
  });

  it('renders server-owned release counts and emits supported actions', () => {
    const fixture = TestBed.createComponent(EnvironmentList);
    const editRequested = vi.fn();
    const requested = vi.fn();
    fixture.componentRef.setInput('environments', [production]);
    fixture.componentRef.setInput('canManage', true);
    fixture.componentInstance.editRequested.subscribe(editRequested);
    fixture.componentInstance.stateChangeRequested.subscribe(requested);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Production');
    expect(fixture.nativeElement.textContent).toContain('Active');
    expect(fixture.nativeElement.textContent).toContain('Open releases');
    fixture.componentInstance.requestEdit(production);
    expect(editRequested).toHaveBeenCalledWith(production);
    fixture.componentInstance.requestStateChange(production);
    expect(requested).toHaveBeenCalledWith({
      action: 'archive',
      environment: production,
    });
  });

  it('does not emit mutations in read-only mode', () => {
    const fixture = TestBed.createComponent(EnvironmentList);
    const editRequested = vi.fn();
    const requested = vi.fn();
    fixture.componentRef.setInput('environments', [production]);
    fixture.componentInstance.editRequested.subscribe(editRequested);
    fixture.componentInstance.stateChangeRequested.subscribe(requested);

    fixture.componentInstance.requestEdit(production);
    fixture.componentInstance.requestStateChange(production);
    expect(editRequested).not.toHaveBeenCalled();
    expect(requested).not.toHaveBeenCalled();
  });
});
