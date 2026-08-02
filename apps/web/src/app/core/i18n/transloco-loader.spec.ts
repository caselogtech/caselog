import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { TranslocoHttpLoader } from './transloco-loader';

describe('TranslocoHttpLoader', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), TranslocoHttpLoader],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads a feature-scoped language file from public assets', async () => {
    const translation = firstValueFrom(
      TestBed.inject(TranslocoHttpLoader).getTranslation('auth/en'),
    );
    const request = TestBed.inject(HttpTestingController).expectOne('/i18n/auth/en.json');
    request.flush({ login: { title: 'Sign in' } });

    await expect(translation).resolves.toEqual({ login: { title: 'Sign in' } });
  });
});
