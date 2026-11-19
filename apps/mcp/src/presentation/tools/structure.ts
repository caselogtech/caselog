import {
  createSectionParamsSchema,
  createSectionRequestSchema,
  createSuiteRequestSchema,
  projectParamsSchema,
  projectStructureWriteHeadersSchema,
  sectionResponseSchema,
  suiteResponseSchema,
} from '@caselog/schemas';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CaselogApiClient } from '../../infrastructure/caselog-api-client.js';
import { WRITE_ANNOTATIONS, toolResult } from '../tool-result.js';

const writeKey = projectStructureWriteHeadersSchema.shape['idempotency-key']
  .unwrap()
  .describe(
    'A new key for a new write intent. Reuse the same key and request when retrying an uncertain result, within seven days.',
  );

export function registerStructureTools(server: McpServer, api: CaselogApiClient): void {
  server.registerTool(
    'create_suite',
    {
      description:
        'Create one test suite in an existing project. Requires structure:write and write role. Read get_project_structure first to avoid duplicate names. Reuse idempotencyKey after uncertain results.',
      inputSchema: z
        .object({
          ...projectParamsSchema.shape,
          idempotencyKey: writeKey,
          request: createSuiteRequestSchema.strict(),
        })
        .strict(),
      outputSchema: suiteResponseSchema,
      annotations: WRITE_ANNOTATIONS,
    },
    ({ projectSlug, idempotencyKey, request }, { signal }) =>
      toolResult(() =>
        api.request({
          method: 'POST',
          path: `/projects/${projectSlug}/structure/suites`,
          body: request,
          idempotencyKey,
          signal,
          responseSchema: suiteResponseSchema,
        }),
      ),
  );
  server.registerTool(
    'create_section',
    {
      description:
        'Create one root or nested section in an existing suite. Requires structure:write and write role. Optional parentId must belong to this suite and project. Read structure first; reuse idempotencyKey after uncertain results.',
      inputSchema: z
        .object({
          ...createSectionParamsSchema.shape,
          idempotencyKey: writeKey,
          request: createSectionRequestSchema.strict(),
        })
        .strict(),
      outputSchema: sectionResponseSchema,
      annotations: WRITE_ANNOTATIONS,
    },
    ({ projectSlug, suiteId, idempotencyKey, request }, { signal }) =>
      toolResult(() =>
        api.request({
          method: 'POST',
          path: `/projects/${projectSlug}/structure/suites/${suiteId}/sections`,
          body: request,
          idempotencyKey,
          signal,
          responseSchema: sectionResponseSchema,
        }),
      ),
  );
}
