import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  createProjectResponseSchema,
  projectListResponseSchema,
  type CreateProjectRequest,
  type CreateProjectResponse,
  type OrganizationTokenResponse,
  type ProjectListResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from './workspace-access';

@Injectable({ providedIn: 'root' })
export class WorkspaceApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  open(slug: string): Promise<OrganizationTokenResponse> {
    return this.workspaceAccess.open(slug);
  }

  async listProjects(
    workspaceSlug: string,
    cursor?: string,
    limit = 25,
  ): Promise<ProjectListResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>('/api/v1/projects', {
        params: { limit, ...(cursor ? { cursor } : {}) },
      }),
    );
    return projectListResponseSchema.parse(response);
  }

  async createProject(
    workspaceSlug: string,
    request: CreateProjectRequest,
  ): Promise<CreateProjectResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(this.http.post<unknown>('/api/v1/projects', request));
    return createProjectResponseSchema.parse(response);
  }
}
