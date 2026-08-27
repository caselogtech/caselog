import { TestBed } from '@angular/core/testing';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { EvidenceFilters } from '../../../components/evidence-filters/evidence-filters';
import { EMPTY_EVIDENCE_FILTERS } from '../../../domain/evidence-explorer';
import { candidateId } from '../../fixtures/readiness-fixtures';

describe('EvidenceFilters', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvidenceFilters, i18nTestingModule()],
    }).compileComponents();
  });

  it('emits normalized valid filters and blocks invalid date ranges', () => {
    const fixture = TestBed.createComponent(EvidenceFilters);
    const emitted = vi.fn();
    fixture.componentRef.setInput('value', { ...EMPTY_EVIDENCE_FILTERS, candidateId });
    fixture.componentInstance.filtersApplied.subscribe(emitted);
    fixture.detectChanges();

    fixture.componentInstance.form.patchValue({
      producerKey: ' caselog.test-runs ',
      currentOnly: 'false',
      observedAfter: '2026-08-27',
      observedBefore: '2026-08-20',
    });
    fixture.componentInstance.apply();
    expect(emitted).not.toHaveBeenCalled();

    fixture.componentInstance.form.controls.observedBefore.setValue('2026-08-28');
    fixture.componentInstance.apply();
    expect(emitted).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId,
        producerKey: 'caselog.test-runs',
        currentOnly: false,
        observedBefore: '2026-08-28',
      }),
    );
  });

  it('preserves candidate context when resetting optional filters', () => {
    const fixture = TestBed.createComponent(EvidenceFilters);
    const emitted = vi.fn();
    fixture.componentRef.setInput('value', {
      ...EMPTY_EVIDENCE_FILTERS,
      candidateId,
      metricKey: 'test.pass_rate',
    });
    fixture.componentInstance.filtersApplied.subscribe(emitted);
    fixture.detectChanges();

    fixture.componentInstance.reset();
    expect(emitted).toHaveBeenCalledWith({
      ...EMPTY_EVIDENCE_FILTERS,
      candidateId,
    });
  });
});
