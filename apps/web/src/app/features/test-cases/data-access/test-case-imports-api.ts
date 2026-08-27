import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  csvImportPreviewResponseSchema,
  csvImportResponseSchema,
  type CsvImportPreviewResponse,
  type CsvImportRequest,
  type CsvImportResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class TestCaseImportsApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async previewCsvImport(
    workspaceSlug: string,
    projectSlug: string,
    request: CsvImportRequest,
  ): Promise<CsvImportPreviewResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/imports/csv/preview`,
        request,
      ),
    );
    return csvImportPreviewResponseSchema.parse(response);
  }

  async commitCsvImport(
    workspaceSlug: string,
    projectSlug: string,
    request: CsvImportRequest,
    idempotencyKey: string,
  ): Promise<CsvImportResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/imports/csv/commit`,
        request,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    );
    return csvImportResponseSchema.parse(response);
  }
}
