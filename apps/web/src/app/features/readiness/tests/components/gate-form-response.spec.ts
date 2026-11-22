import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { GateFormDefinition } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../testing/i18n-testing';
import { GateFormResponse } from '../../components/gate-form-response/gate-form-response';
import { GateFormsApi } from '../../data-access/gate-forms-api';
import { candidateId, gateId, evidence, observationId } from '../fixtures/readiness-fixtures';
const definition: GateFormDefinition = {
  name: 'Quality review',
  description: '',
  fields: [
    {
      key: 'approved',
      label: 'Approved',
      type: 'checkbox',
      required: true,
      description: '',
      options: [],
    },
    { key: 'score', label: 'Score', type: 'number', required: true, description: '', options: [] },
  ],
  criteria: [{ type: 'checkbox', fieldKey: 'approved' }],
};
const observation = {
  ...evidence.items[0],
  id: observationId,
  metricKey: 'gate.form_response',
  dimensions: { testRunRole: 'required', gateId },
  details: {
    kind: 'gate_form_response',
    actorId: gateId,
    reviewerName: 'Reviewer',
    values: { approved: true, score: 90 },
    reports: [],
  },
};
describe('GateFormResponse', () => {
  const api = { list: vi.fn(), record: vi.fn(), upload: vi.fn() };
  let queries: QueryClient;
  beforeEach(async () => {
    api.upload.mockReset();
    queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    api.list.mockReset().mockResolvedValue({ ...evidence, items: [observation], nextCursor: null });
    api.record.mockReset().mockResolvedValue({ observation });
    await TestBed.configureTestingModule({
      imports: [GateFormResponse, i18nTestingModule()],
      providers: [provideTanStackQuery(queries), { provide: GateFormsApi, useValue: api }],
    }).compileComponents();
  });
  afterEach(() => queries.clear());
  async function setup() {
    const fixture = TestBed.createComponent(GateFormResponse);
    for (const [key, value] of Object.entries({
      workspace: 'acme',
      project: 'checkout',
      candidate: candidateId,
      gateId,
      definition,
      canManage: true,
    }))
      fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.current.isSuccess()).toBe(true));
    fixture.detectChanges();
    return fixture;
  }
  it('prefills current answers and submits an unchecked checkbox and numeric zero as valid answers', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    expect(component.values()).toEqual({ approved: true, score: 90 });
    component.change('approved', false);
    component.change('score', 0);
    await component.submit();
    expect(api.record).toHaveBeenCalledWith(
      'acme',
      'checkout',
      candidateId,
      gateId,
      { values: { approved: false, score: 0 }, expectedObservationId: observationId },
      expect.any(String),
    );
  });
  it('preserves edits on failure and background refresh, then explicitly rebases a conflict', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    component.change('score', 99);
    api.record.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 409,
        error: {
          error: { code: 'gate_form_changed', message: 'Changed', details: {}, requestId: 'test' },
        },
      }),
    );
    await component.submit();
    expect(component.conflict()).toBe(true);
    expect(component.values()['score']).toBe(99);
    const nextId = '99999999-9999-4999-8999-999999999999';
    api.list.mockResolvedValue({
      ...evidence,
      items: [{ ...observation, id: nextId }],
      nextCursor: null,
    });
    await component.current.refetch();
    fixture.detectChanges();
    await component.submit();
    expect(api.record).toHaveBeenCalledTimes(1);
    expect(component.values()['score']).toBe(99);
    await component.reload();
    await component.submit();
    expect(api.record).toHaveBeenLastCalledWith(
      'acme',
      'checkout',
      candidateId,
      gateId,
      { values: { approved: true, score: 99 }, expectedObservationId: nextId },
      expect.any(String),
    );
  });
  it('rejects report uploads above the total form limit before transferring a file', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('definition', {
      ...definition,
      fields: [
        ...definition.fields,
        ...Array.from({ length: 4 }, (_, index) => ({
          key: `reports_${index + 1}`,
          label: 'Reports',
          description: '',
          type: 'files',
          required: false,
          options: [],
        })),
      ],
    });
    fixture.detectChanges();
    const reportIds = Array.from({ length: 30 }, () => crypto.randomUUID());
    component.change('reports_1', reportIds.slice(0, 10));
    component.change('reports_2', reportIds.slice(10, 20));
    component.change('reports_3', reportIds.slice(20));
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      value: [new File(['{}'], 'report.json', { type: 'application/json' })],
    });
    const event = new Event('change');
    Object.defineProperty(event, 'target', { value: input });
    await component.upload('reports_4', event);
    expect(api.upload).not.toHaveBeenCalled();
    expect(component.error()).toBe('readiness.forms.filesInvalid');
    expect(component.values()['reports_1']).toEqual(reportIds.slice(0, 10));
  });
  it('rejects missing required answers and disables writes for read-only users', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    component.change('score', null);
    await component.submit();
    expect(api.record).not.toHaveBeenCalled();
    expect(component.invalid()).toContain('score');
    fixture.componentRef.setInput('canManage', false);
    component.change('score', 90);
    await component.submit();
    expect(api.record).not.toHaveBeenCalled();
  });
});
