import type { Routes } from '@angular/router';
import { authRoutes } from './features/auth/auth.routes';
import { systemNotFoundRoute, systemRoutes } from './features/system/public-api';
import { workspaceRoutes } from './features/workspace/workspace.routes';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  ...authRoutes,
  ...systemRoutes,
  {
    path: 'staff',
    loadChildren: () =>
      import('./features/staff/public-api').then(({ staffRoutes }) => staffRoutes),
  },
  ...workspaceRoutes,
  systemNotFoundRoute,
];
