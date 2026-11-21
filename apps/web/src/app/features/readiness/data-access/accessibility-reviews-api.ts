import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  type AccessibilityReviewRequest,
  accessibilityReviewRequestSchema,
  attachmentDownloadResponseSchema,
  candidateReportResponseSchema,
  createUploadSessionResponseSchema,
} from '@caselog/schemas';
import {
  evidenceIngestResponseSchema,
  evidenceListResponseSchema,
} from '@caselog/schemas/evidence';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';
@Injectable({ providedIn: 'root' })
export class AccessibilityReviewsApi {
  private readonly http = inject(HttpClient);
  private readonly workspace = inject(WorkspaceAccess);
  async list(
    workspace: string,
    project: string,
    candidate: string,
    currentOnly: boolean,
    cursor?: string,
  ) {
    await this.workspace.open(workspace);
    return evidenceListResponseSchema.parse(
      await lastValueFrom(
        this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(project)}/evidence`, {
          params: {
            candidateId: candidate,
            metricKey: 'accessibility.manual_review',
            producerKey: 'caselog.accessibility-reviews',
            currentOnly: String(currentOnly),
            limit: currentOnly ? 100 : 25,
            ...(cursor ? { cursor } : {}),
          },
        }),
      ),
    );
  }
  async record(
    workspace: string,
    project: string,
    candidate: string,
    request: AccessibilityReviewRequest,
    key: string,
  ) {
    await this.workspace.open(workspace);
    return evidenceIngestResponseSchema.parse(
      await lastValueFrom(
        this.http.post<unknown>(
          this.url(project, candidate),
          accessibilityReviewRequestSchema.parse(request),
          { headers: { 'Idempotency-Key': key } },
        ),
      ),
    );
  }
  async upload(workspace: string, project: string, candidate: string, file: File) {
    await this.workspace.open(workspace);
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const checksumSha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const contentType =
      file.type ||
      (file.name.endsWith('.json')
        ? 'application/json'
        : file.name.endsWith('.html')
          ? 'text/html'
          : file.name.endsWith('.pdf')
            ? 'application/pdf'
            : 'text/plain');
    const { upload } = createUploadSessionResponseSchema.parse(
      await lastValueFrom(
        this.http.post<unknown>(`${this.url(project, candidate)}/reports/uploads`, {
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
          checksumSha256,
        }),
      ),
    );
    const response = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: file,
    });
    if (!response.ok) throw new Error('Report upload failed');
    return candidateReportResponseSchema.parse(
      await lastValueFrom(
        this.http.post<unknown>(`${this.url(project, candidate)}/reports`, { uploadId: upload.id }),
      ),
    );
  }
  async download(workspace: string, project: string, candidate: string, reportId: string) {
    await this.workspace.open(workspace);
    return attachmentDownloadResponseSchema.parse(
      await lastValueFrom(
        this.http.post<unknown>(
          `${this.url(project, candidate)}/reports/${encodeURIComponent(reportId)}/download`,
          {},
        ),
      ),
    );
  }
  private url(project: string, candidate: string) {
    return `/api/v1/projects/${encodeURIComponent(project)}/candidates/${encodeURIComponent(candidate)}/accessibility-reviews`;
  }
}
