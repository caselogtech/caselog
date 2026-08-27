import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  attachmentDownloadResponseSchema,
  caseAttachmentListResponseSchema,
  caseAttachmentResponseSchema,
  createUploadSessionResponseSchema,
  type AttachmentDownloadResponse,
  type CaseAttachmentListResponse,
  type CaseAttachmentResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class TestCaseAttachmentsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async testCaseAttachments(
    workspaceSlug: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    cursor?: string,
    limit = 25,
  ): Promise<CaseAttachmentListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(this.caseAttachmentUrl(projectSlug, caseId, versionId), {
        params: { limit, ...(cursor ? { cursor } : {}) },
      }),
    );
    return caseAttachmentListResponseSchema.parse(response);
  }

  async uploadTestCaseAttachment(
    workspaceSlug: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    file: File,
  ): Promise<CaseAttachmentResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const checksumSha256 = await sha256(file);
    const collectionUrl = this.caseAttachmentUrl(projectSlug, caseId, versionId);
    const sessionResponse = await lastValueFrom(
      this.http.post<unknown>(`${collectionUrl}/uploads`, {
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        checksumSha256,
      }),
    );
    const { upload } = createUploadSessionResponseSchema.parse(sessionResponse);
    const uploadResponse = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: file,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Attachment upload failed with status ${uploadResponse.status}`);
    }

    const response = await lastValueFrom(
      this.http.post<unknown>(collectionUrl, { uploadId: upload.id }),
    );
    return caseAttachmentResponseSchema.parse(response);
  }

  async testCaseAttachmentDownload(
    workspaceSlug: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    attachmentId: string,
  ): Promise<AttachmentDownloadResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `${this.caseAttachmentUrl(projectSlug, caseId, versionId)}/${encodeURIComponent(attachmentId)}/download`,
        null,
      ),
    );
    return attachmentDownloadResponseSchema.parse(response);
  }

  private caseAttachmentUrl(projectSlug: string, caseId: string, versionId: string): string {
    return `/api/v1/projects/${encodeURIComponent(projectSlug)}/cases/${encodeURIComponent(caseId)}/versions/${encodeURIComponent(versionId)}/attachments`;
  }
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
