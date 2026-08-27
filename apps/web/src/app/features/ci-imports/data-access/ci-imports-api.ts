import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  junitUploadResponseSchema,
  resultIngestionListResponseSchema,
  type JUnitUploadResponse,
  type ResultIngestionListResponse,
  type ResultIngestionStatus,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class CiImportsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async listResultIngestions(
    workspaceSlug: string,
    projectSlug: string,
    cursor?: string,
    status?: ResultIngestionStatus,
    limit = 25,
  ): Promise<ResultIngestionListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/automation/imports`,
        {
          params: { limit, ...(cursor ? { cursor } : {}), ...(status ? { status } : {}) },
        },
      ),
    );
    return resultIngestionListResponseSchema.parse(response);
  }

  async uploadJUnitResults(
    workspaceSlug: string,
    projectSlug: string,
    runId: string,
    file: File,
    metadata: { pipeline?: string; branch?: string } = {},
  ): Promise<JUnitUploadResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}/results/junit`,
        file,
        {
          headers: {
            'Content-Type': 'application/xml',
            'Idempotency-Key': crypto.randomUUID(),
            'X-Caselog-Source': 'Browser upload',
            ...(metadata.pipeline ? { 'X-Caselog-Pipeline': metadata.pipeline } : {}),
            ...(metadata.branch ? { 'X-Caselog-Branch': metadata.branch } : {}),
          },
        },
      ),
    );
    return junitUploadResponseSchema.parse(response);
  }
}
