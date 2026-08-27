import { TranslocoTestingModule } from '@jsverse/transloco';
import rootTranslations from '../../public/i18n/en.json';
import authTranslations from '../../public/i18n/auth/en.json';
import workspaceTranslations from '../../public/i18n/workspace/en.json';
import releasesTranslations from '../../public/i18n/releases/en.json';
import projectSettingsTranslations from '../../public/i18n/projectSettings/en.json';
import readinessTranslations from '../../public/i18n/readiness/en.json';
import workspaceSettingsTranslations from '../../public/i18n/workspaceSettings/en.json';

export function i18nTestingModule(): ReturnType<typeof TranslocoTestingModule.forRoot> {
  return TranslocoTestingModule.forRoot({
    langs: {
      en: {
        ...rootTranslations,
        auth: authTranslations,
        releases: releasesTranslations,
        projectSettings: projectSettingsTranslations,
        readiness: readinessTranslations,
        workspace: workspaceTranslations,
        workspaceSettings: workspaceSettingsTranslations,
      },
    },
    preloadLangs: true,
    translocoConfig: {
      availableLangs: ['en'],
      defaultLang: 'en',
      fallbackLang: 'en',
      reRenderOnLangChange: false,
    },
  });
}
