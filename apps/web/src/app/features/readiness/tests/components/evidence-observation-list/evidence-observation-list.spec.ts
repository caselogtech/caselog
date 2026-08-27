import { TestBed } from '@angular/core/testing';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { EvidenceObservationList } from '../../../components/evidence-observation-list/evidence-observation-list';
import { evidence } from '../../fixtures/readiness-fixtures';

describe('EvidenceObservationList', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvidenceObservationList, i18nTestingModule()],
    }).compileComponents();
  });

  it('renders normalized value, provenance, and diagnostic state', () => {
    const fixture = TestBed.createComponent(EvidenceObservationList);
    fixture.componentRef.setInput('observations', evidence.items);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Test pass rate');
    expect(text).toContain('97.8%');
    expect(text).toContain('Usable evidence');
    expect(text).toContain('junit-ingest');
    expect(text).toContain('Provenance and raw normalized details');
  });
});
