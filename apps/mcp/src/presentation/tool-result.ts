import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolError } from '../domain/tool-error.js';

export async function toolResult(operation: () => Promise<object>): Promise<CallToolResult> {
  try {
    const value = await operation();
    return {
      content: [{ type: 'text', text: JSON.stringify(value) }],
      structuredContent: { ...value },
    };
  } catch (error) {
    const failure =
      error instanceof ToolError
        ? error
        : new ToolError('internal_error', 'Unable to complete the tool request');
    const value = { error: { code: failure.code, message: failure.message, ...failure.context } };
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(value) }],
    };
  }
}

export const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
export const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
