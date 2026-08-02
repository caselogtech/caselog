import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { i18nTestingModule } from '../testing/i18n-testing';

describe('App', () => {
  it('renders the product navigation', async () => {
    await TestBed.configureTestingModule({
      imports: [App, i18nTestingModule()],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.brand')?.textContent?.trim()).toBe('Caselog');
  });
});
