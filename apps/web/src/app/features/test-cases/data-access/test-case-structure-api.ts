import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  projectStructureResponseSchema,
  sectionResponseSchema,
  suiteResponseSchema,
  type ProjectStructureResponse,
  type SectionResponse,
  type SuiteResponse,
} from '@caselog/schemas';
import { lastValueFrom } from 'rxjs';
import { WorkspaceAccess } from '../../workspace/public-api';

@Injectable({ providedIn: 'root' })
export class TestCaseStructureApi {
  private readonly http = inject(HttpClient);
  private readonly workspaceAccess = inject(WorkspaceAccess);

  async projectStructure(
    workspaceSlug: string,
    projectSlug: string,
  ): Promise<ProjectStructureResponse> {
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.get<unknown>(`/api/v1/projects/${encodeURIComponent(projectSlug)}/structure`),
    );
    return projectStructureResponseSchema.parse(response);
  }

  async createSuite(
    workspaceSlug: string,
    projectSlug: string,
    name: string,
  ): Promise<SuiteResponse> {
    await this.workspaceAccess.open(workspaceSlug);
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
    await this.workspaceAccess.open(workspaceSlug);
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
    await this.workspaceAccess.open(workspaceSlug);
    const response = await lastValueFrom(
      this.http.put<unknown>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/structure/suites/${encodeURIComponent(suiteId)}/move`,
        { position },
      ),
    );
    return suiteResponseSchema.parse(response);
  }

  async deleteSuite(workspaceSlug: string, projectSlug: string, suiteId: string): Promise<void> {
    await this.workspaceAccess.open(workspaceSlug);
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
    await this.workspaceAccess.open(workspaceSlug);
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
    await this.workspaceAccess.open(workspaceSlug);
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
    await this.workspaceAccess.open(workspaceSlug);
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
    await this.workspaceAccess.open(workspaceSlug);
    await lastValueFrom(
      this.http.delete<void>(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/structure/sections/${encodeURIComponent(sectionId)}`,
      ),
    );
  }
}
