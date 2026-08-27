import { TestBed } from '@angular/core/testing';
import { PageState } from '../page-state/page-state';

describe('PageState', () => {
  it('renders a semantic heading and recovery message', async () => {
    await TestBed.configureTestingModule({ imports: [PageState] }).compileComponents();
    const fixture = TestBed.createComponent(PageState);
    fixture.componentRef.setInput('title', 'No releases yet');
    fixture.componentRef.setInput('message', 'Create a release to register a candidate.');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('h2')?.textContent).toContain('No releases yet');
    expect(host.querySelector('p')?.textContent).toContain('Create a release');
  });
});
