import type { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

const readinessTranslations = provideTranslocoScope('readiness');

export const readinessRoutes: Routes = [
  {
    path: 'decisions/:decisionId',
    providers: readinessTranslations,
    loadComponent: () =>
      import('./pages/decision-detail/decision-detail').then(
        ({ ReadinessDecisionDetail }) => ReadinessDecisionDetail,
      ),
  },
  {
    path: '',
    providers: readinessTranslations,
    loadComponent: () =>
      import('./pages/candidate-readiness/candidate-readiness').then(
        ({ CandidateReadiness }) => CandidateReadiness,
      ),
  },
];
