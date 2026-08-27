import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  candidateTestRunResponseSchema,
  createReleaseCandidateResponseSchema,
  createReleaseResponseSchema,
  environmentListResponseSchema,
  releaseDetailResponseSchema,
  releaseLifecycleResponseSchema,
  releaseReadinessListResponseSchema,
  testRunListResponseSchema,
  type CandidateTestRunResponse,
  type CandidateTestRunRole,
  type CreateReleaseCandidateRequest,
  type CreateReleaseCandidateResponse,
  type CreateReleaseRequest,
  type CreateReleaseResponse,
  type EnvironmentListResponse,
  type ReleaseDetailResponse,
  type ReleaseLifecycleResponse,
  type ReleaseReadinessListResponse,
  type ReleaseState,
  type TestRunListResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class ReleasesApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async listEnvironments(
    workspaceSlug: string,
    projectSlug: string,
  ): Promise<EnvironmentListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}/environments`),
    );
    return environmentListResponseSchema.parse(response);
  }

  async createRelease(
    workspaceSlug: string,
    projectSlug: string,
    request: CreateReleaseRequest,
    idempotencyKey: string,
  ): Promise<CreateReleaseResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/releases`,
        request,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    );
    return createReleaseResponseSchema.parse(response);
  }

  async releaseDetail(
    workspaceSlug: string,
    projectSlug: string,
    releaseId: string,
  ): Promise<ReleaseDetailResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/releases/${encodeURIComponent(releaseId)}`,
      ),
    );
    return releaseDetailResponseSchema.parse(response);
  }

  async transitionRelease(
    workspaceSlug: string,
    projectSlug: string,
    releaseId: string,
    action: 'activate' | 'release' | 'cancel',
  ): Promise<ReleaseLifecycleResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/releases/${encodeURIComponent(releaseId)}/${action}`,
        {},
      ),
    );
    return releaseLifecycleResponseSchema.parse(response);
  }

  async createCandidate(
    workspaceSlug: string,
    projectSlug: string,
    releaseId: string,
    request: CreateReleaseCandidateRequest,
    idempotencyKey: string,
  ): Promise<CreateReleaseCandidateResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/releases/${encodeURIComponent(releaseId)}/candidates`,
        request,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    );
    return createReleaseCandidateResponseSchema.parse(response);
  }

  async listTestRuns(
    workspaceSlug: string,
    projectSlug: string,
    cursor?: string,
    limit = 100,
  ): Promise<TestRunListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}/runs`, {
        params: { limit, ...(cursor ? { cursor } : {}) },
      }),
    );
    return testRunListResponseSchema.parse(response);
  }

  async linkCandidateTestRun(
    workspaceSlug: string,
    projectSlug: string,
    candidateId: string,
    runId: string,
    role: CandidateTestRunRole,
  ): Promise<CandidateTestRunResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.put<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/candidates/${encodeURIComponent(candidateId)}/test-runs/${encodeURIComponent(runId)}`,
        { role },
      ),
    );
    return candidateTestRunResponseSchema.parse(response);
  }

  async unlinkCandidateTestRun(
    workspaceSlug: string,
    projectSlug: string,
    candidateId: string,
    runId: string,
  ): Promise<void> {
    await this.workspaceAccess.open(workspaceSlug);
    await lastValueFrom(
      this.http.delete<void>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/candidates/${encodeURIComponent(candidateId)}/test-runs/${encodeURIComponent(runId)}`,
      ),
    );
  }

  async listReadiness(
    workspaceSlug: string,
    projectSlug: string,
    cursor?: string,
    state?: ReleaseState,
    limit = 25,
  ): Promise<ReleaseReadinessListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/release-readiness`,
        {
          params: {
            limit,
            ...(cursor ? { cursor } : {}),
            ...(state ? { state } : {}),
          },
        },
      ),
    );

    return releaseReadinessListResponseSchema.parse(response);
  }
}
