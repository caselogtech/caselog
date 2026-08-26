import {
  candidateTestRunListResponseSchema,
  candidateTestRunResponseSchema,
  createEnvironmentResponseSchema,
  createReleaseCandidateResponseSchema,
  createReleaseResponseSchema,
  environmentLifecycleResponseSchema,
  environmentListResponseSchema,
  releaseCandidateListResponseSchema,
  releaseDetailResponseSchema,
  releaseLifecycleResponseSchema,
  releaseListResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class EnvironmentListResponseDto extends createZodDto(environmentListResponseSchema) {}
export class CreateEnvironmentResponseDto extends createZodDto(createEnvironmentResponseSchema) {}
export class EnvironmentLifecycleResponseDto extends createZodDto(
  environmentLifecycleResponseSchema,
) {}
export class ReleaseListResponseDto extends createZodDto(releaseListResponseSchema) {}
export class CreateReleaseResponseDto extends createZodDto(createReleaseResponseSchema) {}
export class ReleaseDetailResponseDto extends createZodDto(releaseDetailResponseSchema) {}
export class ReleaseLifecycleResponseDto extends createZodDto(releaseLifecycleResponseSchema) {}
export class ReleaseCandidateListResponseDto extends createZodDto(
  releaseCandidateListResponseSchema,
) {}
export class CreateReleaseCandidateResponseDto extends createZodDto(
  createReleaseCandidateResponseSchema,
) {}
export class CandidateTestRunListResponseDto extends createZodDto(
  candidateTestRunListResponseSchema,
) {}
export class CandidateTestRunResponseDto extends createZodDto(candidateTestRunResponseSchema) {}
