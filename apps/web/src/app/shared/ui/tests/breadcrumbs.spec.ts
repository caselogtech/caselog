import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Breadcrumbs } from '../breadcrumbs/breadcrumbs';

@Component({
  imports: [Breadcrumbs],
  template: `
    <nav appBreadcrumbs aria-label="Breadcrumbs">
      <a href="/acme/checkout/releases">Releases</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">WEB-2.4.0</span>
    </nav>
  `,
})
class BreadcrumbsHost {}

describe('Breadcrumbs', () => {
  it('adds the shared breadcrumb presentation without changing navigation semantics', () => {
    const fixture = TestBed.configureTestingModule({ imports: [BreadcrumbsHost] }).createComponent(
      BreadcrumbsHost,
    );
    fixture.detectChanges();

    const navigation = fixture.nativeElement.querySelector('nav');
    expect(navigation.classList).toContain('app-breadcrumbs');
    expect(navigation.getAttribute('aria-label')).toBe('Breadcrumbs');
    expect(navigation.querySelector('[aria-current="page"]')?.textContent).toContain('WEB-2.4.0');
  });
});
