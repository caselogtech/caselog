import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  releaseReadinessListResponseSchema,
  type ReleaseReadinessListResponse,
  type ReleaseState,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class ReleasesApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

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
