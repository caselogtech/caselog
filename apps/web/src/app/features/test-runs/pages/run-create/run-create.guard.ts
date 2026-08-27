import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import type { RunCreate } from './run-create';

export const runCreatePendingChangesGuard: CanDeactivateFn<RunCreate> = (component) => {
  if (!component.hasUnsavedChanges()) return true;

  const message = inject(TranslocoService).translate('workspace.runs.new.discardConfirmation');
  return inject(DOCUMENT).defaultView?.confirm(message) ?? false;
};
