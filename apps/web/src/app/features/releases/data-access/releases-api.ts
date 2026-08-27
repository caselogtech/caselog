import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  createReleaseResponseSchema,
  environmentListResponseSchema,
  releaseDetailResponseSchema,
  releaseLifecycleResponseSchema,
  releaseReadinessListResponseSchema,
  type CreateReleaseRequest,
  type CreateReleaseResponse,
  type EnvironmentListResponse,
  type ReleaseDetailResponse,
  type ReleaseLifecycleResponse,
  type ReleaseReadinessListResponse,
  type ReleaseState,
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
