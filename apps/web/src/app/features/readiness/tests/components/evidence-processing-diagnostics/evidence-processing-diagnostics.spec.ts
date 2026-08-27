import { TestBed } from '@angular/core/testing';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { EvidenceProcessingDiagnostics } from '../../../components/evidence-processing-diagnostics/evidence-processing-diagnostics';
import { readiness } from '../../fixtures/readiness-fixtures';

describe('EvidenceProcessingDiagnostics', () => {
  it('stays absent for a healthy pipeline and renders both owned failure stages', () => {
    TestBed.configureTestingModule({
      imports: [EvidenceProcessingDiagnostics, i18nTestingModule()],
    });
    const fixture = TestBed.createComponent(EvidenceProcessingDiagnostics);
    fixture.componentRef.setInput('issues', []);
    fixture.componentRef.setInput('readiness', readiness);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('');

    fixture.componentRef.setInput('issues', [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        stage: 'ingestion',
        code: 'invalid_source_data',
        attempts: 2,
        source: {
          eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          eventName: 'releases.candidate_test_run_linked',
          type: 'release_candidate',
          id: readiness.candidateId,
          revision: '2',
        },
        firstFailedAt: '2026-08-27T10:00:00.000Z',
        lastFailedAt: '2026-08-27T10:01:00.000Z',
      },
    ]);
    fixture.componentRef.setInput('readiness', {
      ...readiness,
      state: 'failed',
      failureCode: 'evaluation_retries_exhausted',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Evidence ingestion');
    expect(fixture.nativeElement.textContent).toContain('Policy evaluation');
    expect(fixture.nativeElement.textContent).toContain('invalid_source_data');
  });
});
