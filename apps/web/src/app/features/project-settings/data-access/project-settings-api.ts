import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  projectResponseSchema,
  type ProjectResponse,
  type UpdateProjectRequest,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class ProjectSettingsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async get(workspaceSlug: string, projectSlug: string): Promise<ProjectResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}`),
    );
    return projectResponseSchema.parse(response);
  }

  async update(
    workspaceSlug: string,
    projectSlug: string,
    request: UpdateProjectRequest,
  ): Promise<ProjectResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.patch<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}`, request),
    );
    return projectResponseSchema.parse(response);
  }

  async archive(workspaceSlug: string, projectSlug: string): Promise<void> {
    await this.workspaceAccess.open(workspaceSlug);
    await lastValueFrom(
      this.http.delete<void>(`/api/v1/projects/${encodeURIComponent(projectSlug)}`),
    );
  }
}
