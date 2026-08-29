import {
  candidateTestRunParamsSchema,
  createEnvironmentHeadersSchema,
  createEnvironmentRequestSchema,
  createReleaseCandidateHeadersSchema,
  createReleaseCandidateRequestSchema,
  createReleaseHeadersSchema,
  createReleaseRequestSchema,
  environmentParamsSchema,
  linkCandidateTestRunRequestSchema,
  releaseCandidateParamsSchema,
  releaseCandidateListQuerySchema,
  releaseListQuerySchema,
  releaseParamsSchema,
  releaseProjectParamsSchema,
  updateEnvironmentRequestSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class ReleaseProjectParamsDto extends createZodDto(releaseProjectParamsSchema) {}
export class EnvironmentParamsDto extends createZodDto(environmentParamsSchema) {}
export class ReleaseParamsDto extends createZodDto(releaseParamsSchema) {}
export class ReleaseCandidateParamsDto extends createZodDto(releaseCandidateParamsSchema) {}
export class ReleaseCandidateListQueryDto extends createZodDto(releaseCandidateListQuerySchema) {}
export class CandidateTestRunParamsDto extends createZodDto(candidateTestRunParamsSchema) {}
export class ReleaseListQueryDto extends createZodDto(releaseListQuerySchema) {}
export class CreateEnvironmentHeadersDto extends createZodDto(createEnvironmentHeadersSchema) {}
export class CreateEnvironmentRequestDto extends createZodDto(createEnvironmentRequestSchema) {}
export class UpdateEnvironmentRequestDto extends createZodDto(updateEnvironmentRequestSchema) {}
export class CreateReleaseHeadersDto extends createZodDto(createReleaseHeadersSchema) {}
export class CreateReleaseRequestDto extends createZodDto(createReleaseRequestSchema) {}
export class CreateReleaseCandidateHeadersDto extends createZodDto(
  createReleaseCandidateHeadersSchema,
) {}
export class CreateReleaseCandidateRequestDto extends createZodDto(
  createReleaseCandidateRequestSchema,
) {}
export class LinkCandidateTestRunRequestDto extends createZodDto(
  linkCandidateTestRunRequestSchema,
) {}
