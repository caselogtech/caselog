import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  projectListResponseSchema,
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
}
