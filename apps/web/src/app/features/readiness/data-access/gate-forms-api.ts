import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { gateFormResponseRequestSchema, type GateFormResponseRequest } from '@caselog/schemas';
import {
  evidenceIngestResponseSchema,
  evidenceListResponseSchema,
} from '@caselog/schemas/evidence';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';
import { CandidateReportsApi } from './candidate-reports-api';
@Injectable({ providedIn: 'root' })
export class GateFormsApi {
  private readonly http = inject(HttpClient);
  private readonly workspace = inject(WorkspaceAccess);
  private readonly reports = inject(CandidateReportsApi);
  async list(
    workspace: string,
    project: string,
    candidate: string,
    gateId: string,
    currentOnly: boolean,
    cursor?: string,
  ) {
    await this.workspace.open(workspace);
    return evidenceListResponseSchema.parse(
      await lastValueFrom(
        this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(project)}/evidence`, {
          params: {
            candidateId: candidate,
            gateId,
            metricKey: 'gate.form_response',
            producerKey: 'caselog.gate-forms',
            currentOnly: String(currentOnly),
            limit: currentOnly ? 1 : 10,
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
    gateId: string,
    request: GateFormResponseRequest,
    key: string,
  ) {
    await this.workspace.open(workspace);
    return evidenceIngestResponseSchema.parse(
      await lastValueFrom(
        this.http.post<unknown>(
          `/api/v1/projects/${encodeURIComponent(project)}/candidates/${encodeURIComponent(candidate)}/gate-forms/${encodeURIComponent(gateId)}/responses`,
          gateFormResponseRequestSchema.parse(request),
          { headers: { 'Idempotency-Key': key } },
        ),
      ),
    );
  }
  upload(workspace: string, project: string, candidate: string, file: File) {
    return this.reports.upload(workspace, project, candidate, file, 'gate-forms');
  }
  download(workspace: string, project: string, candidate: string, reportId: string) {
    return this.reports.download(workspace, project, candidate, reportId, 'gate-forms');
  }
}
