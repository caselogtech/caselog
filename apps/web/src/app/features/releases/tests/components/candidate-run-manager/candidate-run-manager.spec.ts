import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CandidateTestRun, TestRunSummary } from '@caselog/schemas';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { CandidateRunManager } from '../../../components/candidate-run-manager/candidate-run-manager';

const candidateId = '11111111-1111-4111-8111-111111111111';
const link: CandidateTestRun = {
  testRunId: '22222222-2222-4222-8222-222222222222',
  name: 'Regression',
  status: 'completed',
  role: 'required',
  linkedAt: '2026-08-27T10:00:00.000Z',
};
const availableRun: TestRunSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Smoke',
  status: 'active',
  build: 'build-42',
  itemCount: 12,
  completedCount: 10,
  failedCount: 1,
  createdAt: '2026-08-27T11:00:00.000Z',
  closedAt: null,
};

describe('CandidateRunManager', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CandidateRunManager, i18nTestingModule()],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('emits explicit evidence roles for new and existing links', () => {
    const fixture = createFixture();
    const linked = vi.fn();
    fixture.componentInstance.linkRequested.subscribe(linked);

    fixture.componentInstance.form.setValue({
      runId: availableRun.id,
      role: 'informational',
    });
    fixture.componentInstance.requestLink();
    fixture.componentInstance.updateRole(link.testRunId, 'informational');

    expect(linked).toHaveBeenNthCalledWith(1, {
      candidateId,
      runId: availableRun.id,
      role: 'informational',
    });
    expect(linked).toHaveBeenNthCalledWith(2, {
      candidateId,
      runId: link.testRunId,
      role: 'informational',
    });
  });

  it('confirms unlinking with the candidate and test-run identities', () => {
    const fixture = createFixture();
    const unlinked = vi.fn();
    fixture.componentInstance.unlinkRequested.subscribe(unlinked);

    fixture.componentInstance.unlinking.set(link);
    fixture.componentInstance.confirmUnlink();

    expect(unlinked).toHaveBeenCalledWith({ candidateId, runId: link.testRunId });
    expect(fixture.componentInstance.unlinking()).toBeNull();
  });
});

function createFixture() {
  const fixture = TestBed.createComponent(CandidateRunManager);
  fixture.componentRef.setInput('candidateId', candidateId);
  fixture.componentRef.setInput('workspaceSlug', 'acme');
  fixture.componentRef.setInput('projectSlug', 'authentication');
  fixture.componentRef.setInput('links', [link]);
  fixture.componentRef.setInput('runs', [availableRun]);
  fixture.componentRef.setInput('canManage', true);
  fixture.componentRef.setInput('mutable', true);
  fixture.detectChanges();
  return fixture;
}
