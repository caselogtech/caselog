export function enumQueryParam<const Value extends string>(
  value: string | null,
  allowedValues: readonly Value[],
): Value | undefined {
  return allowedValues.includes(value as Value) ? (value as Value) : undefined;
}

export function textQueryParam(value: string | null): string {
  return value?.trim() ?? '';
}
