import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import {
  hasWorkspacePermission,
  type WorkspacePermission,
} from '../../../shared/models/workspace-role';
import { WorkspaceAccess } from '../data-access/workspace-access';

export function requireWorkspacePermission(permission: WorkspacePermission): CanActivateFn {
  return async (route, state) => {
    const router = inject(Router);
    const workspaceAccess = inject(WorkspaceAccess);
    const workspaceSlug = route.paramMap.get('org');
    if (!workspaceSlug) return forbiddenRedirect(router, state.url);

    const session = await workspaceAccess.open(workspaceSlug);
    return hasWorkspacePermission(session.role, permission) || forbiddenRedirect(router, state.url);
  };
}

function forbiddenRedirect(router: Router, returnUrl: string) {
  return router.createUrlTree(['/status', 'forbidden'], {
    queryParams: { returnUrl },
  });
}
