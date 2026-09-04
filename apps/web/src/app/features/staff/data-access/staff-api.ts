import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  type GrantStaffOperatorRequest,
  type RevokeStaffOperatorRequest,
  type StaffAuditLogListResponse,
  staffAuditLogListResponseSchema,
  type StaffBillingAccountListResponse,
  staffBillingAccountListResponseSchema,
  type StaffListQuery,
  type StaffOperatorListResponse,
  staffOperatorListResponseSchema,
  type StaffOperatorResponse,
  staffOperatorResponseSchema,
  type StaffOverviewResponse,
  staffOverviewResponseSchema,
  type StaffSessionResponse,
  staffSessionResponseSchema,
  type StaffUserListResponse,
  staffUserListResponseSchema,
  type StaffWorkspaceListResponse,
  staffWorkspaceListResponseSchema,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class StaffApi {
  private readonly http = inject(HttpClient);

  async session(): Promise<StaffSessionResponse> {
    return staffSessionResponseSchema.parse(
      await lastValueFrom(this.http.get<unknown>('/api/v1/staff/session')),
    );
  }

  async overview(): Promise<StaffOverviewResponse> {
    return staffOverviewResponseSchema.parse(
      await lastValueFrom(this.http.get<unknown>('/api/v1/staff/overview')),
    );
  }

  async users(query: Partial<StaffListQuery>): Promise<StaffUserListResponse> {
    return staffUserListResponseSchema.parse(
      await lastValueFrom(
        this.http.get<unknown>('/api/v1/staff/users', { params: listParams(query) }),
      ),
    );
  }

  async workspaces(query: Partial<StaffListQuery>): Promise<StaffWorkspaceListResponse> {
    return staffWorkspaceListResponseSchema.parse(
      await lastValueFrom(
        this.http.get<unknown>('/api/v1/staff/workspaces', { params: listParams(query) }),
      ),
    );
  }

  async billingAccounts(query: Partial<StaffListQuery>): Promise<StaffBillingAccountListResponse> {
    return staffBillingAccountListResponseSchema.parse(
      await lastValueFrom(
        this.http.get<unknown>('/api/v1/staff/billing-accounts', {
          params: listParams(query),
        }),
      ),
    );
  }

  async operators(query: Partial<StaffListQuery>): Promise<StaffOperatorListResponse> {
    return staffOperatorListResponseSchema.parse(
      await lastValueFrom(
        this.http.get<unknown>('/api/v1/staff/operators', { params: listParams(query) }),
      ),
    );
  }

  async grantOperator(request: GrantStaffOperatorRequest): Promise<StaffOperatorResponse> {
    return staffOperatorResponseSchema.parse(
      await lastValueFrom(this.http.post<unknown>('/api/v1/staff/operators', request)),
    );
  }

  async revokeOperator(userId: string, request: RevokeStaffOperatorRequest): Promise<void> {
    await lastValueFrom(
      this.http.delete<void>(`/api/v1/staff/operators/${encodeURIComponent(userId)}`, {
        body: request,
      }),
    );
  }

  async auditLogs(query: Partial<StaffListQuery>): Promise<StaffAuditLogListResponse> {
    return staffAuditLogListResponseSchema.parse(
      await lastValueFrom(
        this.http.get<unknown>('/api/v1/staff/audit-logs', { params: listParams(query) }),
      ),
    );
  }
}

function listParams(query: Partial<StaffListQuery>): HttpParams {
  let params = new HttpParams().set('limit', String(query.limit ?? 25));
  if (query.cursor) params = params.set('cursor', query.cursor);
  if (query.q) params = params.set('q', query.q);
  return params;
}
