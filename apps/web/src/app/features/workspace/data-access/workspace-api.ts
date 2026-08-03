import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  createTestCaseResponseSchema,
  createTestRunResponseSchema,
  assignTestRunItemResponseSchema,
  createTestResultResponseSchema,
  projectListResponseSchema,
  projectStructureResponseSchema,
  runProgressResponseSchema,
  sectionResponseSchema,
  suiteResponseSchema,
  testCaseListResponseSchema,
  testCaseLifecycleResponseSchema,
  testCaseDetailResponseSchema,
  testCaseVersionSchema,
  testRunListResponseSchema,
  testRunDetailResponseSchema,
  testRunLifecycleResponseSchema,
  testResultDetailResponseSchema,
  testResultHistoryResponseSchema,
  type CreateTestCaseRequest,
  type CreateTestCaseResponse,
  type CreateTestRunRequest,
  type CreateTestRunResponse,
  type AssignTestRunItemResponse,
  type CreateTestResultRequest,
  type CreateTestResultResponse,
  type OrganizationTokenResponse,
  type ProjectListResponse,
  type ProjectStructureResponse,
  type RunProgressResponse,
  type SectionResponse,
  type SuiteResponse,
  type TestCaseListResponse,
  type TestCaseLifecycleResponse,
  type TestCaseDetailResponse,
  type TestCaseVersion,
  type TestRunListResponse,
  type TestRunDetailResponse,
  type TestRunLifecycleResponse,
  type TestResultDetailResponse,
  type TestResultHistoryResponse,
  type TestRunStatus,
  type UpdateTestCaseRequest,
  type UpdateTestCaseResponse,
  updateTestCaseResponseSchema,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceSession } from '../../../core/auth/workspace-session';
import { AuthApi } from '../../auth/public-api';

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
    state: 'active' | 'archived' = 'active',
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
          ...(state === 'archived' ? { state } : {}),
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

  async listTestRuns(
    workspaceSlug: string,
    projectSlug: string,
    cursor?: string,
    status?: TestRunStatus,
    limit = 25,
  ): Promise<TestRunListResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}/runs`, {
        params: { limit, ...(cursor ? { cursor } : {}), ...(status ? { status } : {}) },
      }),
    );
    return testRunListResponseSchema.parse(response);
  }

  async createTestRun(
    workspaceSlug: string,
    projectSlug: string,
    request: CreateTestRunRequest,
  ): Promise<CreateTestRunResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}/runs`, request, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    );
    return createTestRunResponseSchema.parse(response);
  }

  async testRun(
    workspaceSlug: string,
    projectSlug: string,
    runId: string,
    cursor?: string,
    limit = 50,
  ): Promise<TestRunDetailResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}`,
        { params: { limit, ...(cursor ? { cursor } : {}) } },
      ),
    );
    return testRunDetailResponseSchema.parse(response);
  }

  async runProgress(
    workspaceSlug: string,
    projectSlug: string,
    runId: string,
  ): Promise<RunProgressResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/reports/runs/${encodeURIComponent(runId)}/progress`,
      ),
    );
    return runProgressResponseSchema.parse(response);
  }

  async startTestRun(
    workspaceSlug: string,
    projectSlug: string,
    runId: string,
  ): Promise<TestRunLifecycleResponse> {
    return this.changeTestRunState(workspaceSlug, projectSlug, runId, 'start');
  }

  async closeTestRun(
    workspaceSlug: string,
    projectSlug: string,
    runId: string,
  ): Promise<TestRunLifecycleResponse> {
    return this.changeTestRunState(workspaceSlug, projectSlug, runId, 'close');
  }

  async assignTestRunItem(
    workspaceSlug: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    assigneeId: string | null,
  ): Promise<AssignTestRunItemResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.put<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}/assignee`,
        { assigneeId },
      ),
    );
    return assignTestRunItemResponseSchema.parse(response);
  }

  async recordTestResult(
    workspaceSlug: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    request: CreateTestResultRequest,
  ): Promise<CreateTestResultResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}/results`,
        request,
      ),
    );
    return createTestResultResponseSchema.parse(response);
  }

  async testResultHistory(
    workspaceSlug: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    cursor?: string,
    limit = 25,
  ): Promise<TestResultHistoryResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}/results`,
        { params: { limit, ...(cursor ? { cursor } : {}) } },
      ),
    );
    return testResultHistoryResponseSchema.parse(response);
  }

  async testResult(
    workspaceSlug: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    resultId: string,
  ): Promise<TestResultDetailResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}/results/${encodeURIComponent(resultId)}`,
      ),
    );
    return testResultDetailResponseSchema.parse(response);
  }

  private async changeTestRunState(
    workspaceSlug: string,
    projectSlug: string,
    runId: string,
    action: 'start' | 'close',
  ): Promise<TestRunLifecycleResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}/${action}`,
        null,
      ),
    );
    return testRunLifecycleResponseSchema.parse(response);
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

  async duplicateTestCase(
    workspaceSlug: string,
    projectSlug: string,
    caseId: string,
  ): Promise<CreateTestCaseResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}/duplicate`,
        null,
      ),
    );
    return createTestCaseResponseSchema.parse(response);
  }

  async archiveTestCase(workspaceSlug: string, projectSlug: string, caseId: string): Promise<void> {
    await this.open(workspaceSlug);
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
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}/restore`,
        null,
      ),
    );
    return testCaseLifecycleResponseSchema.parse(response);
  }

  async createSuite(
    workspaceSlug: string,
    projectSlug: string,
    name: string,
  ): Promise<SuiteResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/structure/suites`,
        { name },
      ),
    );
    return suiteResponseSchema.parse(response);
  }

  async updateSuite(
    workspaceSlug: string,
    projectSlug: string,
    suiteId: string,
    name: string,
  ): Promise<SuiteResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.put<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/structure/suites/${encodeURIComponent(suiteId)}`,
        { name },
      ),
    );
    return suiteResponseSchema.parse(response);
  }

  async moveSuite(
    workspaceSlug: string,
    projectSlug: string,
    suiteId: string,
    position: number,
  ): Promise<SuiteResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.put<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/structure/suites/${encodeURIComponent(suiteId)}/move`,
        { position },
      ),
    );
    return suiteResponseSchema.parse(response);
  }

  async deleteSuite(workspaceSlug: string, projectSlug: string, suiteId: string): Promise<void> {
    await this.open(workspaceSlug);
    await lastValueFrom(
      this.http.delete<void>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/structure/suites/${encodeURIComponent(suiteId)}`,
      ),
    );
  }

  async createSection(
    workspaceSlug: string,
    projectSlug: string,
    suiteId: string,
    name: string,
    parentId?: string,
  ): Promise<SectionResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/structure/suites/${encodeURIComponent(suiteId)}/sections`,
        { name, ...(parentId ? { parentId } : {}) },
      ),
    );
    return sectionResponseSchema.parse(response);
  }

  async updateSection(
    workspaceSlug: string,
    projectSlug: string,
    sectionId: string,
    name: string,
  ): Promise<SectionResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.put<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/structure/sections/${encodeURIComponent(sectionId)}`,
        { name },
      ),
    );
    return sectionResponseSchema.parse(response);
  }

  async moveSection(
    workspaceSlug: string,
    projectSlug: string,
    sectionId: string,
    request: { suiteId: string; parentId: string | null; position: number },
  ): Promise<SectionResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.put<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/structure/sections/${encodeURIComponent(sectionId)}/move`,
        request,
      ),
    );
    return sectionResponseSchema.parse(response);
  }

  async deleteSection(
    workspaceSlug: string,
    projectSlug: string,
    sectionId: string,
  ): Promise<void> {
    await this.open(workspaceSlug);
    await lastValueFrom(
      this.http.delete<void>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/structure/sections/${encodeURIComponent(sectionId)}`,
      ),
    );
  }
}
