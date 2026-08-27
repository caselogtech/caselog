import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { releaseDetailResponseSchema, type ReleaseDetailResponse } from '@caselog/schemas';
import {
  createReadinessWaiverRequestSchema,
  candidatePolicyAssignmentResponseSchema,
  candidateReadinessResponseSchema,
  readinessDecisionResponseSchema,
  readinessDecisionListResponseSchema,
  readinessPolicyListResponseSchema,
  readinessPolicyResponseSchema,
  readinessWaiverListResponseSchema,
  readinessWaiverResponseSchema,
  revokeReadinessWaiverRequestSchema,
  type CreateReadinessWaiverRequest,
  type CandidatePolicyAssignmentResponse,
  type CandidateReadinessResponse,
  type ReadinessDecisionResponse,
  type ReadinessDecisionListResponse,
  type ReadinessPolicyListResponse,
  type ReadinessPolicyResponse,
  type ReadinessWaiverListResponse,
  type ReadinessWaiverResponse,
  type RevokeReadinessWaiverRequest,
} from '@caselog/schemas/readiness';
import { evidenceListResponseSchema, type EvidenceListResponse } from '@caselog/schemas/evidence';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class ReadinessApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async releaseDetail(
    workspaceSlug: string,
    projectSlug: string,
    releaseId: string,
  ): Promise<ReleaseDetailResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/releases/${encodeURIComponent(releaseId)}`,
      ),
    );
    return releaseDetailResponseSchema.parse(response);
  }

  async current(
    workspaceSlug: string,
    projectSlug: string,
    candidateId: string,
  ): Promise<CandidateReadinessResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(this.candidateReadinessUrl(projectSlug, candidateId)),
    );
    return candidateReadinessResponseSchema.parse(response);
  }

  async evaluate(
    workspaceSlug: string,
    projectSlug: string,
    candidateId: string,
  ): Promise<CandidateReadinessResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `${this.candidateReadinessUrl(projectSlug, candidateId)}/evaluations`,
        {},
      ),
    );
    return candidateReadinessResponseSchema.parse(response);
  }

  async history(
    workspaceSlug: string,
    projectSlug: string,
    candidateId: string,
    cursor?: string,
    limit = 25,
  ): Promise<ReadinessDecisionListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`${this.candidateReadinessUrl(projectSlug, candidateId)}/decisions`, {
        params: { limit, ...(cursor ? { cursor } : {}) },
      }),
    );
    return readinessDecisionListResponseSchema.parse(response);
  }

  async decision(
    workspaceSlug: string,
    projectSlug: string,
    decisionId: string,
  ): Promise<ReadinessDecisionResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(this.readinessDecisionUrl(projectSlug, decisionId)),
    );
    return readinessDecisionResponseSchema.parse(response);
  }

  async waivers(
    workspaceSlug: string,
    projectSlug: string,
    decisionId: string,
    cursor?: string,
    limit = 25,
  ): Promise<ReadinessWaiverListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`${this.readinessDecisionUrl(projectSlug, decisionId)}/waivers`, {
        params: { limit, ...(cursor ? { cursor } : {}) },
      }),
    );
    return readinessWaiverListResponseSchema.parse(response);
  }

  async createWaiver(
    workspaceSlug: string,
    projectSlug: string,
    decisionId: string,
    request: CreateReadinessWaiverRequest,
    idempotencyKey: string,
  ): Promise<ReadinessWaiverResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const payload = createReadinessWaiverRequestSchema.parse(request);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `${this.readinessDecisionUrl(projectSlug, decisionId)}/waivers`,
        payload,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    );
    return readinessWaiverResponseSchema.parse(response);
  }

  async revokeWaiver(
    workspaceSlug: string,
    projectSlug: string,
    decisionId: string,
    waiverId: string,
    request: RevokeReadinessWaiverRequest,
    idempotencyKey: string,
  ): Promise<ReadinessWaiverResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const payload = revokeReadinessWaiverRequestSchema.parse(request);
    const response = await lastValueFrom(
      this.http.post<unknown>(
        `${this.readinessDecisionUrl(projectSlug, decisionId)}/waivers/${encodeURIComponent(waiverId)}/revocation`,
        payload,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    );
    return readinessWaiverResponseSchema.parse(response);
  }

  async evidence(
    workspaceSlug: string,
    projectSlug: string,
    candidateId: string,
    cursor?: string,
    limit = 100,
  ): Promise<EvidenceListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}/evidence`, {
        params: {
          candidateId,
          currentOnly: false,
          limit,
          ...(cursor ? { cursor } : {}),
        },
      }),
    );
    return evidenceListResponseSchema.parse(response);
  }

  async policies(
    workspaceSlug: string,
    projectSlug: string,
    cursor?: string,
    limit = 100,
  ): Promise<ReadinessPolicyListResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/release-policies`,
        { params: { limit, ...(cursor ? { cursor } : {}) } },
      ),
    );
    return readinessPolicyListResponseSchema.parse(response);
  }

  async policy(
    workspaceSlug: string,
    projectSlug: string,
    policyId: string,
  ): Promise<ReadinessPolicyResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/release-policies/${encodeURIComponent(policyId)}`,
      ),
    );
    return readinessPolicyResponseSchema.parse(response);
  }

  async assignPolicy(
    workspaceSlug: string,
    projectSlug: string,
    candidateId: string,
    policyId: string,
    idempotencyKey: string,
  ): Promise<CandidatePolicyAssignmentResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.put<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/candidates/${encodeURIComponent(candidateId)}/readiness-policy`,
        { policyId },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      ),
    );
    return candidatePolicyAssignmentResponseSchema.parse(response);
  }

  private candidateReadinessUrl(projectSlug: string, candidateId: string): string {
    return `/api/v1/projects/${encodeURIComponent(projectSlug)}/candidates/${encodeURIComponent(candidateId)}/readiness`;
  }

  private readinessDecisionUrl(projectSlug: string, decisionId: string): string {
    return `/api/v1/projects/${encodeURIComponent(projectSlug)}/readiness-decisions/${encodeURIComponent(decisionId)}`;
  }
}
