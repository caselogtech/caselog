import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  attachmentDownloadResponseSchema,
  candidateReportResponseSchema,
  createUploadSessionResponseSchema,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';
@Injectable({ providedIn: 'root' })
export class CandidateReportsApi {
  private readonly http = inject(HttpClient);
  private readonly workspace = inject(WorkspaceAccess);
  async upload(
    workspace: string,
    project: string,
    candidate: string,
    file: File,
    kind: 'accessibility-reviews' | 'gate-forms',
  ) {
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
        this.http.post<unknown>(`${this.url(project, candidate, kind)}/reports/uploads`, {
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
        this.http.post<unknown>(`${this.url(project, candidate, kind)}/reports`, {
          uploadId: upload.id,
        }),
      ),
    );
  }
  async download(
    workspace: string,
    project: string,
    candidate: string,
    reportId: string,
    kind: 'accessibility-reviews' | 'gate-forms',
  ) {
    await this.workspace.open(workspace);
    return attachmentDownloadResponseSchema.parse(
      await lastValueFrom(
        this.http.post<unknown>(
          `${this.url(project, candidate, kind)}/reports/${encodeURIComponent(reportId)}/download`,
          {},
        ),
      ),
    );
  }
  private url(project: string, candidate: string, kind: 'accessibility-reviews' | 'gate-forms') {
    return `/api/v1/projects/${encodeURIComponent(project)}/candidates/${encodeURIComponent(candidate)}/${kind}`;
  }
}
