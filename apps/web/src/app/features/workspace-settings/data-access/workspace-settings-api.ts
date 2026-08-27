import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  workspaceSettingsResponseSchema,
  type DeleteWorkspaceRequest,
  type UpdateWorkspaceRequest,
  type WorkspaceSettingsResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class WorkspaceSettingsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async get(workspaceSlug: string): Promise<WorkspaceSettingsResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(this.http.get<unknown>('/api/v1/workspace'));
    return workspaceSettingsResponseSchema.parse(response);
  }

  async update(
    workspaceSlug: string,
    request: UpdateWorkspaceRequest,
  ): Promise<WorkspaceSettingsResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(this.http.patch<unknown>('/api/v1/workspace', request));
    return workspaceSettingsResponseSchema.parse(response);
  }

  async delete(
    workspaceSlug: string,
    request: DeleteWorkspaceRequest,
  ): Promise<WorkspaceSettingsResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.delete<unknown>('/api/v1/workspace', { body: request }),
    );
    return workspaceSettingsResponseSchema.parse(response);
  }
}
