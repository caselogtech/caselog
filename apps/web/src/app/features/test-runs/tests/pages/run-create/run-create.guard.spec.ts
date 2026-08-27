import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import type { RunCreate } from '../../../pages/run-create/run-create';
import { runCreatePendingChangesGuard } from '../../../pages/run-create/run-create.guard';

describe('runCreatePendingChangesGuard', () => {
  const confirm = vi.fn();

  beforeEach(() => {
    confirm.mockReset();
    TestBed.configureTestingModule({
      imports: [i18nTestingModule()],
      providers: [{ provide: DOCUMENT, useValue: { defaultView: { confirm } } }],
    });
  });

  it('leaves a pristine planner without prompting', () => {
    const result = runGuard({ hasUnsavedChanges: () => false } as RunCreate);

    expect(result).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('confirms before discarding a configured run', () => {
    confirm.mockReturnValue(true);

    const result = runGuard({ hasUnsavedChanges: () => true } as RunCreate);

    expect(result).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Discard the unsaved test run?');
  });

  function runGuard(component: RunCreate) {
    return TestBed.runInInjectionContext(() =>
      runCreatePendingChangesGuard(
        component,
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
        {} as RouterStateSnapshot,
      ),
    );
  }
});
