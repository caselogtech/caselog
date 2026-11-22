import type { GateFormCriterion, GateFormDefinition } from '@caselog/schemas';
export function gateCriterionDescription(
  form: GateFormDefinition,
  criterion: GateFormCriterion,
): { label: string; metric: boolean; value: string } {
  if (criterion.type === 'test_results')
    return {
      label: criterion.metricKey,
      metric: true,
      value: `${symbol(criterion.operator)} ${criterion.expected}${criterion.metricKey === 'test.failed_count' ? '' : '%'}`,
    };
  const field = form.fields.find(({ key }) => key === criterion.fieldKey);
  return {
    label: field?.label ?? criterion.fieldKey,
    metric: false,
    value:
      criterion.type === 'checkbox'
        ? 'checked'
        : criterion.type === 'number'
          ? `${symbol(criterion.operator)} ${criterion.expected}`
          : (field?.options.find(({ key }) => key === criterion.expected)?.label ??
            criterion.expected),
  };
}
function symbol(operator: string): string {
  return (
    ({ eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' } as Record<string, string>)[
      operator
    ] ?? operator
  );
}
