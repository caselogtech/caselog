import { CandidateReportsApi } from './candidate-reports-api';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  type AccessibilityReviewRequest,
  accessibilityReviewRequestSchema,
} from '@caselog/schemas';
import {
  evidenceIngestResponseSchema,
  evidenceListResponseSchema,
} from '@caselog/schemas/evidence';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';
@Injectable({ providedIn: 'root' })
export class AccessibilityReviewsApi {
  private readonly reports = inject(CandidateReportsApi);
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
  upload(workspace: string, project: string, candidate: string, file: File) {
    return this.reports.upload(workspace, project, candidate, file, 'accessibility-reviews');
  }
  download(workspace: string, project: string, candidate: string, reportId: string) {
    return this.reports.download(workspace, project, candidate, reportId, 'accessibility-reviews');
  }
  private url(project: string, candidate: string) {
    return `/api/v1/projects/${encodeURIComponent(project)}/candidates/${encodeURIComponent(candidate)}/accessibility-reviews`;
  }
}
