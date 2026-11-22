import { TestBed } from '@angular/core/testing';
import type { GateFormDefinition } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../testing/i18n-testing';
import { CandidateGateForms } from '../../components/candidate-gate-forms/candidate-gate-forms';
import { GateFormsApi } from '../../data-access/gate-forms-api';
import { ReadinessApi } from '../../data-access/readiness-api';
import {
  candidateId,
  evidence,
  policy,
  policyId,
  policyVersionId,
  readiness,
} from '../fixtures/readiness-fixtures';

describe('CandidateGateForms', () => {
  let queries: QueryClient;
  afterEach(() => queries.clear());

  it('keeps each gate collapsed with its server result and marks old results as stale', async () => {
    const version = policy.policy.versions.find(({ id }) => id === policyVersionId);
    const gate = version?.gates[0];
    const evaluation = readiness.decision?.gates[0];
    if (!version || !gate || !evaluation) throw new Error('Missing policy fixture');
    const form: GateFormDefinition = {
      name: 'Review',
      description: '',
      fields: [],
      criteria: [
        {
          type: 'test_results',
          metricKey: 'test.pass_rate',
          testRunRole: 'required',
          operator: 'eq',
          expected: 100,
        },
      ],
    };
    const gates = ['Tests', 'Accessibility', 'Performance'].map((name, index) => ({
      ...gate,
      id: `gate-${index}`,
      form: { ...form, name },
    }));
    queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await TestBed.configureTestingModule({
      imports: [CandidateGateForms, i18nTestingModule()],
      providers: [
        provideTanStackQuery(queries),
        {
          provide: ReadinessApi,
          useValue: {
            policy: vi.fn().mockResolvedValue({
              policy: { ...policy.policy, versions: [{ ...version, gates }] },
            }),
          },
        },
        {
          provide: GateFormsApi,
          useValue: {
            list: vi.fn().mockResolvedValue({ ...evidence, items: [], nextCursor: null }),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CandidateGateForms);
    for (const [key, value] of Object.entries({
      workspace: 'acme',
      project: 'checkout',
      candidate: candidateId,
      policyId,
      versionId: policyVersionId,
      evaluationState: 'current',
      evaluations: gates.map((item, index) => ({
        ...evaluation,
        gateId: item.id,
        result: index === 0 ? 'failed' : 'passed',
      })),
    }))
      fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.policy.isSuccess()).toBe(true));
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    const panels = host.querySelectorAll<HTMLDetailsElement>('.gate-panel');
    expect(panels).toHaveLength(3);
    expect(Array.from(panels).every((panel) => !panel.open)).toBe(true);
    const headers = Array.from(host.querySelectorAll('.gate-summary'));
    expect(headers[0]?.textContent).toContain('Tests');
    expect(headers[0]?.textContent).toContain('Failed');
    expect(headers[1]?.textContent).toContain('Passed');
    expect(headers[2]?.textContent).toContain('Passed');

    fixture.componentRef.setInput('evaluationState', 'stale');
    fixture.detectChanges();
    expect(headers.every((header) => header.textContent?.includes('Stale'))).toBe(true);
    expect(headers.every((header) => !header.textContent?.includes('Passed'))).toBe(true);
  });
});
