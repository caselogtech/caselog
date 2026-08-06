export class CsvImportParseError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = CsvImportParseError.name;
  }
}
