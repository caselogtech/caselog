import { validateGateFormAnswers, type GateFormCriterionResult } from '@caselog/schemas';
import type { ReadinessEvidence } from '../models/readiness-evidence';
import type { ReadinessGate } from '../models/readiness-policy';
import type { GateEvaluation } from './readiness-evaluator';

type MetricEvaluator = (
  gate: ReadinessGate,
  evidence: ReadinessEvidence[],
  at: Date,
) => GateEvaluation;

export function evaluateGateForm(
  gate: ReadinessGate,
  evidence: ReadinessEvidence[],
  at: Date,
  evaluateMetric: MetricEvaluator,
): GateEvaluation {
  if (!gate.form) throw new Error('Form gate is missing its definition');
  const responseGate = {
    ...gate,
    dimensions: { testRunRole: 'required' as const, gateId: gate.id },
  };
  const response = evaluateMetric(responseGate, evidence, at);
  const observation = evidence.find(
    ({ observationId }) => observationId === response.selectedObservationId,
  );
  const details = response.result === 'PASSED' ? observation?.formResponse : undefined;
  const criteria: GateFormCriterionResult[] = [];
  const needsResponse =
    gate.form.fields.some(({ required }) => required) ||
    gate.form.criteria.some(({ type }) => type !== 'test_results');
  if (needsResponse || details) {
    const valid = details && validateGateFormAnswers(gate.form, details.values).length === 0;
    criteria.push({
      key: 'form_response',
      label: gate.form.name,
      result: !details
        ? response.result === 'PASSED'
          ? 'failed'
          : lowerResult(response)
        : valid
          ? 'passed'
          : 'failed',
      diagnostic: !details
        ? response.diagnostic === 'NONE'
          ? 'incomplete'
          : lowerDiagnostic(response)
        : valid
          ? 'none'
          : 'incomplete',
      observationId: response.selectedObservationId,
      actual: details ? (valid ? 'Complete' : 'Incomplete') : null,
      expected: 'Required fields completed',
    });
  }
  gate.form.criteria.forEach((criterion, index) => {
    if (criterion.type === 'test_results') {
      const metricGate: ReadinessGate = {
        ...gate,
        form: undefined,
        metricKey: criterion.metricKey,
        dimensions: {
          testRunRole: criterion.testRunRole,
          ...(criterion.minimumPriority ? { minimumPriority: criterion.minimumPriority } : {}),
        },
        producerKey: 'caselog.test-runs',
        operator: criterion.operator.toUpperCase() as ReadinessGate['operator'],
        expected:
          criterion.metricKey === 'test.failed_count'
            ? { type: 'integer', value: criterion.expected }
            : {
                type: 'percentage',
                value: criterion.expected.toFixed(9).replace(/\.?0+$/, '') || '0',
              },
      };
      const evaluation = evaluateMetric(metricGate, evidence, at);
      criteria.push({
        key: `condition_${index}`,
        label: criterion.metricKey,
        result: lowerResult(evaluation),
        diagnostic: lowerDiagnostic(evaluation),
        observationId: evaluation.selectedObservationId,
        actual: evaluation.actual ? String(evaluation.actual.value) : null,
        expected: `${criterion.operator} ${criterion.expected}`,
      });
      return;
    }
    const field = gate.form?.fields.find(({ key }) => key === criterion.fieldKey);
    const value =
      details && Object.hasOwn(details.values, criterion.fieldKey)
        ? details.values[criterion.fieldKey]
        : undefined;
    const missing = value === undefined || value === '';
    const passed =
      criterion.type === 'checkbox'
        ? value === true
        : criterion.type === 'select'
          ? value === criterion.expected
          : typeof value === 'number' && compare(value, criterion.expected, criterion.operator);
    criteria.push({
      key: `condition_${index}`,
      label: field?.label ?? criterion.fieldKey,
      result: missing ? 'failed' : passed ? 'passed' : 'failed',
      diagnostic: missing ? 'missing' : 'none',
      observationId: details ? response.selectedObservationId : null,
      actual: missing ? null : String(value),
      expected:
        criterion.type === 'checkbox'
          ? 'Checked'
          : criterion.type === 'select'
            ? (field?.options.find(({ key }) => key === criterion.expected)?.label ??
              criterion.expected)
            : `${criterion.operator} ${criterion.expected}`,
    });
  });
  const failed = criteria.find(({ result }) => result === 'failed');
  const unknown = criteria.find(({ result }) => result === 'unknown');
  const warning = criteria.find(({ result }) => result === 'warning');
  const selected = failed ?? unknown ?? warning;
  const result = failed
    ? gate.impact === 'BLOCKING'
      ? 'FAILED'
      : 'WARNING'
    : unknown
      ? 'UNKNOWN'
      : warning
        ? 'WARNING'
        : 'PASSED';
  const diagnostic = (selected?.diagnostic ?? 'none').toUpperCase() as GateEvaluation['diagnostic'];
  return {
    gateId: gate.id,
    gateKey: gate.key,
    position: gate.position,
    result,
    diagnostic,
    actual: { type: 'integer', value: result === 'PASSED' ? 1 : 0 },
    expected: gate.expected,
    selectedObservationId: response.selectedObservationId,
    explanationCode:
      diagnostic === 'NONE'
        ? result === 'PASSED'
          ? 'comparison_passed'
          : 'comparison_failed'
        : diagnostic === 'MISSING'
          ? 'missing_evidence'
          : diagnostic === 'INCOMPLETE'
            ? 'incomplete_evidence'
            : diagnostic === 'STALE'
              ? 'stale_evidence'
              : 'untrusted_evidence',
    criteria,
  };
}
function lowerResult(evaluation: GateEvaluation): GateFormCriterionResult['result'] {
  return evaluation.result.toLowerCase() as GateFormCriterionResult['result'];
}
function lowerDiagnostic(evaluation: GateEvaluation): GateFormCriterionResult['diagnostic'] {
  return evaluation.diagnostic.toLowerCase() as GateFormCriterionResult['diagnostic'];
}
function compare(
  value: number,
  expected: number,
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte',
): boolean {
  return {
    eq: value === expected,
    ne: value !== expected,
    gt: value > expected,
    gte: value >= expected,
    lt: value < expected,
    lte: value <= expected,
  }[operator];
}
