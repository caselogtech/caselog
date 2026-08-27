import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import type { CaseCreate } from '../../../pages/case-create/case-create';
import { caseCreatePendingChangesGuard } from '../../../pages/case-create/case-create.guard';

describe('caseCreatePendingChangesGuard', () => {
  const confirm = vi.fn();

  beforeEach(() => {
    confirm.mockReset();
    TestBed.configureTestingModule({
      imports: [i18nTestingModule()],
      providers: [{ provide: DOCUMENT, useValue: { defaultView: { confirm } } }],
    });
  });

  it('leaves a pristine editor without prompting', () => {
    const result = runGuard({ hasUnsavedChanges: () => false } as CaseCreate);

    expect(result).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('uses an explicit confirmation before discarding changes', () => {
    confirm.mockReturnValue(true);

    const result = runGuard({ hasUnsavedChanges: () => true } as CaseCreate);

    expect(result).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Discard the unsaved test case changes?');
  });

  function runGuard(component: CaseCreate) {
    return TestBed.runInInjectionContext(() =>
      caseCreatePendingChangesGuard(
        component,
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
        {} as RouterStateSnapshot,
      ),
    );
  }
});
