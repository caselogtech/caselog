type MissingResult<TMissing extends string> = TMissing extends string ? { kind: TMissing } : never;

export type ReportingResult<T, TMissing extends string> =
  | { kind: 'found'; value: T }
  | MissingResult<TMissing>;
