import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  caseExecutionHistoryResponseSchema,
  createTestCaseResponseSchema,
  testCaseDetailResponseSchema,
  testCaseLifecycleResponseSchema,
  testCaseListResponseSchema,
  testCaseVersionSchema,
  type CaseExecutionHistoryResponse,
  type CreateTestCaseRequest,
  type CreateTestCaseResponse,
  type TestCaseDetailResponse,
  type TestCaseLifecycleResponse,
  type TestCaseListResponse,
  type TestCaseVersion,
  type UpdateTestCaseRequest,
  type UpdateTestCaseResponse,
  updateTestCaseResponseSchema,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class TestCasesApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async listTestCases(
    workspaceSlug: string,
    projectSlug: string,
    cursor?: string,
    search?: string,
    sectionId?: string,
    state: 'active' | 'archived' = 'active',
    limit = 50,
  ): Promise<TestCaseListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}/cases`, {
        params: {
          limit,
          ...(cursor ? { cursor } : {}),
          ...(search ? { search } : {}),
          ...(sectionId ? { sectionId } : {}),
          ...(state === 'archived' ? { state } : {}),
        },
      }),
    );
    return testCaseListResponseSchema.parse(response);
  }

  async testCaseExecutionHistory(
    workspaceSlug: string,
    projectSlug: string,
    caseId: string,
    cursor?: string,
    limit = 25,
  ): Promise<CaseExecutionHistoryResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/reports/cases/${encodeURIComponent(caseId)}/history`,
        { params: { limit, ...(cursor ? { cursor } : {}) } },
      ),
    );
    return caseExecutionHistoryResponseSchema.parse(response);
  }

  async createTestCase(
    workspaceSlug: string,
    projectSlug: string,
    request: CreateTestCaseRequest,
  ): Promise<CreateTestCaseResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}/cases`, request),
    );
    return createTestCaseResponseSchema.parse(response);
  }

  async testCase(
    workspaceSlug: string,
    projectSlug: string,
    caseId: string,
  ): Promise<TestCaseDetailResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}`,
      ),
    );
    return testCaseDetailResponseSchema.parse(response);
  }

  async updateTestCase(
    workspaceSlug: string,
    projectSlug: string,
    caseId: string,
    request: UpdateTestCaseRequest,
  ): Promise<UpdateTestCaseResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.put<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}`,
        request,
      ),
    );
    return updateTestCaseResponseSchema.parse(response);
  }

  async testCaseVersion(
    workspaceSlug: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
  ): Promise<TestCaseVersion> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}/versions/${encodeURIComponent(versionId)}`,
      ),
    );
    return testCaseVersionSchema.parse(response);
  }

  async restoreTestCaseVersion(
    workspaceSlug: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    baseVersion: number,
  ): Promise<UpdateTestCaseResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}/versions/${encodeURIComponent(versionId)}/restore`,
        { baseVersion },
      ),
    );
    return updateTestCaseResponseSchema.parse(response);
  }

  async duplicateTestCase(
    workspaceSlug: string,
    projectSlug: string,
    caseId: string,
  ): Promise<CreateTestCaseResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}/duplicate`,
        null,
      ),
    );
    return createTestCaseResponseSchema.parse(response);
  }

  async archiveTestCase(workspaceSlug: string, projectSlug: string, caseId: string): Promise<void> {
    await this.workspaceAccess.open(workspaceSlug);
    await lastValueFrom(
      this.http.delete<void>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}`,
      ),
    );
  }

  async restoreArchivedTestCase(
    workspaceSlug: string,
    projectSlug: string,
    caseId: string,
  ): Promise<TestCaseLifecycleResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}/restore`,
        null,
      ),
    );
    return testCaseLifecycleResponseSchema.parse(response);
  }
}
