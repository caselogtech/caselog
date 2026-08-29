import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  createEnvironmentResponseSchema,
  environmentLifecycleResponseSchema,
  environmentListResponseSchema,
  updateEnvironmentResponseSchema,
  type CreateEnvironmentRequest,
  type CreateEnvironmentResponse,
  type EnvironmentLifecycleResponse,
  type EnvironmentListResponse,
  type UpdateEnvironmentRequest,
  type UpdateEnvironmentResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

export type EnvironmentLifecycleAction = 'archive' | 'restore';

@Injectable({ providedIn: 'root' })
export class ProjectEnvironmentsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async list(workspaceSlug: string, projectSlug: string): Promise<EnvironmentListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}/environments`),
    );
    return environmentListResponseSchema.parse(response);
  }

  async create(
    workspaceSlug: string,
    projectSlug: string,
    request: CreateEnvironmentRequest,
    idempotencyKey: string,
  ): Promise<CreateEnvironmentResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/environments`,
        request,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    );
    return createEnvironmentResponseSchema.parse(response);
  }

  async update(
    workspaceSlug: string,
    projectSlug: string,
    environmentId: string,
    request: UpdateEnvironmentRequest,
  ): Promise<UpdateEnvironmentResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.patch<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/environments/${encodeURIComponent(environmentId)}`,
        request,
      ),
    );
    return updateEnvironmentResponseSchema.parse(response);
  }

  async changeState(
    workspaceSlug: string,
    projectSlug: string,
    environmentId: string,
    action: EnvironmentLifecycleAction,
  ): Promise<EnvironmentLifecycleResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/environments/${encodeURIComponent(environmentId)}/${action}`,
        {},
      ),
    );
    return environmentLifecycleResponseSchema.parse(response);
  }
}
