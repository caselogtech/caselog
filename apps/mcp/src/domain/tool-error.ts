export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly context: { status?: number; requestId?: string; currentVersion?: number } = {},
  ) {
    super(message);
    this.name = 'ToolError';
  }
}
