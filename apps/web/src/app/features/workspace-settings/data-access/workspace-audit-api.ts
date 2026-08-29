import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { auditLogListResponseSchema, type AuditLogListResponse } from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class WorkspaceAuditApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async list(
    workspaceSlug: string,
    cursor?: string,
    action?: string,
    limit = 25,
  ): Promise<AuditLogListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>('/api/v1/audit-logs', {
        params: {
          limit,
          ...(cursor ? { cursor } : {}),
          ...(action ? { action } : {}),
        },
      }),
    );
    return auditLogListResponseSchema.parse(response);
  }
}
