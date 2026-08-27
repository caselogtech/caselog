import type { Routes } from '@angular/router';

export const ciImportsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/ci-imports/ci-imports').then(({ CiImports }) => CiImports),
  },
];
