import {
  candidateReadinessParamsSchema,
  candidateReadinessResponseSchema,
} from '@caselog/schemas/readiness';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CaselogApiClient } from '../../infrastructure/caselog-api-client.js';
import { READ_ANNOTATIONS, toolResult } from '../tool-result.js';

export function registerReadinessTools(server: McpServer, api: CaselogApiClient): void {
  server.registerTool(
    'get_candidate_readiness',
    {
      description:
        'Read server-computed readiness for an exact immutable candidate. Requires readiness:read. Explain pending, failed, stale, unknown or waived states as returned; never invent passing evidence or recompute gates.',
      inputSchema: candidateReadinessParamsSchema.strict(),
      outputSchema: candidateReadinessResponseSchema,
      annotations: READ_ANNOTATIONS,
    },
    ({ projectSlug, candidateId }, { signal }) =>
      toolResult(() =>
        api.request({
          method: 'GET',
          path: `/projects/${projectSlug}/candidates/${candidateId}/readiness`,
          signal,
          responseSchema: candidateReadinessResponseSchema,
        }),
      ),
  );
}
