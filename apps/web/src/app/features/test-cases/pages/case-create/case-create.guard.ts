import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type { CaseCreate } from './case-create';

export const caseCreatePendingChangesGuard: CanDeactivateFn<CaseCreate> = (component) => {
  if (!component.hasUnsavedChanges()) return true;

  const message = inject(TranslocoService).translate('workspace.cases.new.discardConfirmation');
  return inject(DOCUMENT).defaultView?.confirm(message) ?? false;
};
