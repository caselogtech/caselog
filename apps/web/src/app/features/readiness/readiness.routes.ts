import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const readinessTranslations = provideTranslocoScope('readiness');

export const readinessRoutes: Routes = [
  {
    path: '',
    providers: readinessTranslations,
    loadComponent: () =>
      import('./pages/candidate-readiness/candidate-readiness').then(
        ({ CandidateReadiness }) => CandidateReadiness,
      ),
  },
];
