import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { routes } from './app.routes';
import { BrowserSession } from './core/auth/browser-session';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { sessionAuthInterceptor } from './core/auth/session-auth.interceptor';
import { AuthApi } from './features/auth/auth-api';

function restoreSession(): Promise<void> {
  const authApi = inject(AuthApi);
  const browserSession = inject(BrowserSession);

  return authApi
    .refresh()
    .then((session) => browserSession.start(session))
    .catch(() => browserSession.clear());
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([sessionAuthInterceptor])),
    provideAppInitializer(restoreSession),
    provideRouter(routes),
    provideTransloco({
      config: {
        availableLangs: ['en'],
        defaultLang: 'en',
        fallbackLang: 'en',
        reRenderOnLangChange: false,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    provideTanStackQuery(
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1 },
          mutations: { retry: false },
        },
      }),
    ),
  ],
};
