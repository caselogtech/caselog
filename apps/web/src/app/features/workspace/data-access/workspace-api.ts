import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  attachmentDownloadResponseSchema,
  assignTestRunItemResponseSchema,
  createTestResultResponseSchema,
  createTestRunResponseSchema,
  junitUploadResponseSchema,
  projectListResponseSchema,
  resultIngestionListResponseSchema,
  runProgressResponseSchema,
  testRunDetailResponseSchema,
  testRunLifecycleResponseSchema,
  testRunListResponseSchema,
  testResultDetailResponseSchema,
  testResultHistoryResponseSchema,
  type AttachmentDownloadResponse,
  type AssignTestRunItemResponse,
  type CreateTestResultRequest,
  type CreateTestResultResponse,
  type CreateTestRunRequest,
  type CreateTestRunResponse,
  type JUnitUploadResponse,
  type OrganizationTokenResponse,
  type ProjectListResponse,
  type ResultIngestionListResponse,
  type ResultIngestionStatus,
  type RunProgressResponse,
  type TestRunDetailResponse,
  type TestRunLifecycleResponse,
  type TestRunListResponse,
  type TestRunStatus,
  type TestResultDetailResponse,
  type TestResultHistoryResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from './workspace-access';

@Injectable({ providedIn: 'root' })
export class WorkspaceApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  open(slug: string): Promise<OrganizationTokenResponse> {
    return this.workspaceAccess.open(slug);
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

  async listResultIngestions(
    workspaceSlug: string,
    projectSlug: string,
    cursor?: string,
    status?: ResultIngestionStatus,
    limit = 25,
  ): Promise<ResultIngestionListResponse> {
    await this.open(workspaceSlug);
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
    await this.open(workspaceSlug);
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

  async testResultAttachmentDownload(
    workspaceSlug: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    resultId: string,
    attachmentId: string,
  ): Promise<AttachmentDownloadResponse> {
    await this.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/runs/${encodeURIComponent(runId)}/items/${encodeURIComponent(itemId)}/results/${encodeURIComponent(resultId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
        null,
      ),
    );
    return attachmentDownloadResponseSchema.parse(response);
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
}
