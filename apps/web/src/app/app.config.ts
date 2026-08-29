import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withNavigationErrorHandler, withRouterConfig } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { provideTanStackQuery } from '@tanstack/angular-query-experimental';

import { routes } from './app.routes';
import { BrowserSession } from './core/auth/browser-session';
import { sessionAuthInterceptor } from './core/auth/session-auth.interceptor';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { InstanceCapabilities } from './core/instance/instance-capabilities';
import { APP_QUERY_CLIENT } from './core/query/app-query-client';
import { navigationErrorRedirect } from './core/routing/navigation-error-redirect';
import { AuthApi } from './features/auth/public-api';

function restoreSession(): Promise<void> {
  const authApi = inject(AuthApi);
  const browserSession = inject(BrowserSession);

  return authApi
    .refresh()
    .then((session) => browserSession.start(session))
    .catch(() => browserSession.clear());
}

function loadInstanceCapabilities(): Promise<void> {
  return inject(InstanceCapabilities)
    .load()
    .catch(() => undefined);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([sessionAuthInterceptor])),
    provideAppInitializer(restoreSession),
    provideAppInitializer(loadInstanceCapabilities),
    provideRouter(
      routes,
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      withNavigationErrorHandler(navigationErrorRedirect),
    ),
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
    provideTanStackQuery(APP_QUERY_CLIENT),
  ],
};
