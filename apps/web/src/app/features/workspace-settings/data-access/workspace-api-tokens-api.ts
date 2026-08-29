import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  apiTokenListResponseSchema,
  createApiTokenResponseSchema,
  type ApiTokenListResponse,
  type CreateApiTokenRequest,
  type CreateApiTokenResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class WorkspaceApiTokensApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async list(workspaceSlug: string): Promise<ApiTokenListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(this.http.get<unknown>('/api/v1/api-tokens'));
    return apiTokenListResponseSchema.parse(response);
  }

  async create(
    workspaceSlug: string,
    request: CreateApiTokenRequest,
  ): Promise<CreateApiTokenResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(this.http.post<unknown>('/api/v1/api-tokens', request));
    return createApiTokenResponseSchema.parse(response);
  }

  async revoke(workspaceSlug: string, tokenId: string): Promise<void> {
    await this.workspaceAccess.open(workspaceSlug);
    await lastValueFrom(
      this.http.delete<void>(`/api/v1/api-tokens/${encodeURIComponent(tokenId)}`),
    );
  }
}
