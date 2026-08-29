import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { i18nTestingModule } from '../testing/i18n-testing';
import { App } from './app';

describe('App', () => {
  it('renders the active route', async () => {
    await TestBed.configureTestingModule({
      imports: [App, i18nTestingModule()],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('router-outlet')).not.toBeNull();
  });
});
