import { TestBed } from '@angular/core/testing';
import { i18nTestingModule } from '../../../../../testing/i18n-testing';
import { WaiverManager } from '../../components/waiver-manager/waiver-manager';
import { decisionDetail, waiverId, waiverList } from '../fixtures/readiness-fixtures';

describe('WaiverManager', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WaiverManager, i18nTestingModule()],
    }).compileComponents();
  });

  it('emits an exact single-gate waiver request without changing the decision', () => {
    const fixture = TestBed.createComponent(WaiverManager);
    fixture.componentRef.setInput('decision', decisionDetail.decision);
    fixture.componentRef.setInput('waivers', []);
    fixture.componentRef.setInput('canManage', true);
    const emitted = vi.fn();
    fixture.componentInstance.createRequested.subscribe(emitted);
    const gate = decisionDetail.decision.gates[0];
    if (!gate) throw new Error('Expected a gate evaluation fixture');
    const gateEvaluationId = gate.id;
    fixture.componentInstance.createForm.setValue({
      scopeType: 'gate_evaluation',
      gateEvaluationId,
      reason: '  Accepted gate risk  ',
      expiresAt: '',
      externalApprovalReference: '  CHG-1042  ',
    });

    fixture.componentInstance.requestCreate();

    expect(emitted).toHaveBeenCalledWith({
      scope: { type: 'gate_evaluation', gateEvaluationId },
      reason: 'Accepted gate risk',
      expiresAt: null,
      externalApprovalReference: 'CHG-1042',
    });
    expect(decisionDetail.decision.status).toBe('blocked');
  });

  it('requires a reason and emits an attributable revocation request', () => {
    const fixture = TestBed.createComponent(WaiverManager);
    fixture.componentRef.setInput('decision', decisionDetail.decision);
    fixture.componentRef.setInput('waivers', waiverList.items);
    fixture.componentRef.setInput('canManage', true);
    const emitted = vi.fn();
    fixture.componentInstance.revokeRequested.subscribe(emitted);

    fixture.componentInstance.startRevocation(waiverId);
    fixture.componentInstance.requestRevocation();
    expect(emitted).not.toHaveBeenCalled();

    fixture.componentInstance.revokeForm.setValue({ reason: '  Approval withdrawn  ' });
    fixture.componentInstance.requestRevocation();
    expect(emitted).toHaveBeenCalledWith({
      waiverId,
      request: { reason: 'Approval withdrawn' },
    });
  });
});
