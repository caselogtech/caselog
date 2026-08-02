import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  createTestCaseResponseSchema,
  projectListResponseSchema,
  projectStructureResponseSchema,
  testCaseListResponseSchema,
  testCaseDetailResponseSchema,
  testCaseVersionSchema,
  type CreateTestCaseRequest,
  type CreateTestCaseResponse,
  type OrganizationTokenResponse,
  type ProjectListResponse,
  type ProjectStructureResponse,
  type TestCaseListResponse,
  type TestCaseDetailResponse,
  type TestCaseVersion,
  type UpdateTestCaseRequest,
  type UpdateTestCaseResponse,
  updateTestCaseResponseSchema,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceSession } from '../../core/auth/workspace-session';
import { AuthApi } from '../auth/auth-api';

@Injectable({ providedIn: 'root' })
export class WorkspaceApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private opening: { slug: string; promise: Promise<OrganizationTokenResponse> } | null = null;

  async open(slug: string): Promise<OrganizationTokenResponse> {
    if (this.workspaceSession.isActiveFor(slug)) {
      const current = this.workspaceSession.current();
      if (current) {
        return current;
      }
    }

    if (this.opening?.slug === slug) {
      return this.opening.promise;
    }

    this.workspaceSession.clear();
    const promise = this.authApi.organizationToken(slug).then((session) => {
      this.workspaceSession.start(session);
      return session;
    });
    this.opening = { slug, promise };
    try {
      return await promise;
    } finally {
      if (this.opening?.promise === promise) {
        this.opening = null;
      }
    }
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

  async listTestCases(
    workspaceSlug: string,
    projectSlug: string,
    cursor?: string,
    search?: string,
    sectionId?: string,
    limit = 50,
  ): Promise<TestCaseListResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}/cases`, {
        params: {
          limit,
          ...(cursor ? { cursor } : {}),
          ...(search ? { search } : {}),
          ...(sectionId ? { sectionId } : {}),
        },
      }),
    );
    return testCaseListResponseSchema.parse(response);
  }

  async projectStructure(
    workspaceSlug: string,
    projectSlug: string,
  ): Promise<ProjectStructureResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}/structure`),
    );
    return projectStructureResponseSchema.parse(response);
  }

  async createTestCase(
    workspaceSlug: string,
    projectSlug: string,
    request: CreateTestCaseRequest,
  ): Promise<CreateTestCaseResponse> {
    await this.open(workspaceSlug);
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
    await this.open(workspaceSlug);
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
    await this.open(workspaceSlug);
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
    await this.open(workspaceSlug);
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
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}/versions/${encodeURIComponent(versionId)}/restore`,
        { baseVersion },
      ),
    );
    return updateTestCaseResponseSchema.parse(response);
  }
}
