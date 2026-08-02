import { Inject, Injectable } from '@nestjs/common';
import {
  projectListResponseSchema,
  type ProjectListQuery,
  type ProjectListResponse,
} from '@caselog/schemas';
import { ProjectRepository } from './project.repository';

@Injectable()
export class ProjectService {
  constructor(@Inject(ProjectRepository) private readonly projects: ProjectRepository) {}

  async list(organizationId: string, query: ProjectListQuery): Promise<ProjectListResponse> {
    return projectListResponseSchema.parse(
      await this.projects.list(organizationId, query.cursor, query.limit),
    );
  }
}
