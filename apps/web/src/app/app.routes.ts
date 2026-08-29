import type { Routes } from '@angular/router';
import { authRoutes } from './features/auth/auth.routes';
import { systemNotFoundRoute, systemRoutes } from './features/system/public-api';
import { workspaceRoutes } from './features/workspace/workspace.routes';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  ...authRoutes,
  ...systemRoutes,
  ...workspaceRoutes,
  systemNotFoundRoute,
];
