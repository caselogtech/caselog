import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

export const readinessEvidenceRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    providers: provideTranslocoScope('readiness'),
    loadComponent: () =>
      import('./pages/evidence-explorer/evidence-explorer').then(
        ({ EvidenceExplorer }) => EvidenceExplorer,
      ),
  },
];
