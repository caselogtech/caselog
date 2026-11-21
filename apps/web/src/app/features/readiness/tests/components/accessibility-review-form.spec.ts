import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { i18nTestingModule } from '../../../../../testing/i18n-testing';
import { AccessibilityReviewForm } from '../../components/accessibility-review-form/accessibility-review-form';
import { AccessibilityReviewsApi } from '../../data-access/accessibility-reviews-api';
const dimensions = {
  testRunRole: 'required' as const,
  accessibilityStandard: 'WCAG 2.2 AA',
  pageUrls: ['https://example.com/'],
  manualChecks: ['keyboard_navigation' as const, 'screen_reader' as const],
};
const report = {
  id: '11111111-1111-4111-8111-111111111111',
  fileName: 'axe.json',
  contentType: 'application/json' as const,
  sizeBytes: 10,
  checksumSha256: 'a'.repeat(64),
  createdAt: '2026-11-21T10:00:00.000Z',
};
describe('AccessibilityReviewForm', () => {
  const api = { record: vi.fn(), upload: vi.fn() };
  beforeEach(async () => {
    api.record.mockReset();
    api.upload.mockReset();
    await TestBed.configureTestingModule({
      imports: [AccessibilityReviewForm, i18nTestingModule()],
      providers: [{ provide: AccessibilityReviewsApi, useValue: api }],
    }).compileComponents();
  });
  function open() {
    const fixture = TestBed.createComponent(AccessibilityReviewForm);
    for (const [key, value] of Object.entries({
      workspace: 'acme',
      project: 'checkout',
      candidate: 'candidate',
      gateKey: 'a11y',
      dimensions,
    }))
      fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture;
  }
  function fill(form: AccessibilityReviewForm) {
    form.form.patchValue({
      outcome: 'ok',
      tools: 'Lighthouse 13, Deque axe 4.10',
      keyboardNavigation: 'passed',
      screenReader: 'passed',
      notes: 'Reviewed checkout',
    });
    form.reports.set([report]);
  }
  it('requires a report and passing required checks before recording OK', async () => {
    const fixture = open();
    const form = fixture.componentInstance;
    fill(form);
    form.reports.set([]);
    await form.submit();
    expect(api.record).not.toHaveBeenCalled();
    form.reports.set([report]);
    form.form.controls.screenReader.setValue('not_checked');
    await form.submit();
    expect(api.record).not.toHaveBeenCalled();
    expect(form.form.controls.notes.value).toBe('Reviewed checkout');
  });
  it('preserves reports and input on a recoverable error and reuses the retry key', async () => {
    const fixture = open();
    const form = fixture.componentInstance;
    fill(form);
    api.record.mockRejectedValue(new Error('offline'));
    await form.submit();
    await form.submit();
    expect(form.reports()).toEqual([report]);
    expect(form.form.controls.tools.value).toContain('Deque axe');
    expect(api.record.mock.calls[0]?.[4]).toBe(api.record.mock.calls[1]?.[4]);
  });
  it('announces concurrent edits and prevents another save until explicit reload', async () => {
    const fixture = open();
    const form = fixture.componentInstance;
    fill(form);
    api.record.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: {
          error: {
            code: 'accessibility_review_changed',
            message: 'Changed',
            details: {},
            requestId: 'request',
          },
        },
      }),
    );
    await form.submit();
    expect(form.conflict()).toBe(true);
    await form.submit();
    expect(api.record).toHaveBeenCalledOnce();
    expect(form.reports()).toEqual([report]);
  });
  it('submits tools and human outcome without profile, producer key or numeric fields', async () => {
    const fixture = open();
    const form = fixture.componentInstance;
    fill(form);
    api.record.mockResolvedValue({ observation: { id: 'review-id' } });
    await form.submit();
    expect(api.record).toHaveBeenCalledWith(
      'acme',
      'checkout',
      'candidate',
      expect.objectContaining({
        outcome: 'ok',
        tools: ['Lighthouse 13', 'Deque axe 4.10'],
        reportIds: [report.id],
        expectedObservationId: null,
        dimensions,
      }),
      expect.any(String),
    );
    expect(form.reports()).toEqual([]);
  });
});
