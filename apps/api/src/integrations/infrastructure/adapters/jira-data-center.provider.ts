import { Inject, Injectable } from '@nestjs/common';
import type {
  IssueTrackerIdentity,
  JiraIssue,
  JiraIssueSearchRequest,
  JiraIssueSearchResponse,
  JiraProject,
} from '@caselog/schemas';
import { z } from 'zod';
import {
  IssueTrackerProvider,
  type CreateIssueInput,
  type IssueTrackerConnection,
} from '../../application/ports/issue-tracker-provider';
import { IssueTrackerRequestError } from '../../domain/errors/issue-tracker.error';
import { ISSUE_TRACKER_CONFIG, type IssueTrackerConfig } from '../config/issue-tracker.config';
import { OutboundUrlPolicy } from './outbound-url.policy';

const identitySchema = z.object({
  accountId: z.string().optional(),
  key: z.string().optional(),
  name: z.string().optional(),
  displayName: z.string().min(1),
});

const projectSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  projectTypeKey: z.string().optional(),
});

const issueSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  fields: z.object({
    summary: z.string(),
    status: z.object({ id: z.string().min(1), name: z.string().min(1) }),
    issuetype: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  }),
});

const searchResponseSchema = z.object({
  startAt: z.number().int().nonnegative(),
  maxResults: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  issues: z.array(issueSchema),
});

const createdIssueSchema = z.object({ id: z.string().min(1), key: z.string().min(1) });

@Injectable()
export class JiraDataCenterProvider extends IssueTrackerProvider {
  readonly provider = 'jira';
  readonly deployment = 'data_center';

  constructor(
    @Inject(ISSUE_TRACKER_CONFIG) private readonly config: IssueTrackerConfig,
    @Inject(OutboundUrlPolicy) private readonly urlPolicy: OutboundUrlPolicy,
  ) {
    super();
  }

  async verifyConnection(connection: IssueTrackerConnection): Promise<IssueTrackerIdentity> {
    const identity = identitySchema.parse(await this.request(connection, '/rest/api/2/myself'));
    const id = identity.accountId ?? identity.key ?? identity.name;
    if (!id) {
      throw new IssueTrackerRequestError('invalid_response', 'Jira did not return a user ID');
    }
    return { id, displayName: identity.displayName };
  }

  async listProjects(connection: IssueTrackerConnection): Promise<JiraProject[]> {
    const projects = z
      .array(projectSchema)
      .parse(await this.request(connection, '/rest/api/2/project'));
    return projects.map((project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
      projectType: project.projectTypeKey ?? null,
    }));
  }

  async searchIssues(
    connection: IssueTrackerConnection,
    request: JiraIssueSearchRequest,
  ): Promise<JiraIssueSearchResponse> {
    const response = searchResponseSchema.parse(
      await this.request(connection, '/rest/api/2/search', {
        method: 'POST',
        body: JSON.stringify({
          jql: request.jql,
          startAt: request.startAt,
          maxResults: request.maxResults,
          fields: ['summary', 'status', 'issuetype'],
        }),
      }),
    );
    return { ...response, issues: response.issues.map((issue) => this.toIssue(connection, issue)) };
  }

  async getIssue(connection: IssueTrackerConnection, issueKey: string): Promise<JiraIssue> {
    const issue = issueSchema.parse(
      await this.request(
        connection,
        `/rest/api/2/issue/${encodeURIComponent(issueKey)}?fields=summary,status,issuetype`,
      ),
    );
    return this.toIssue(connection, issue);
  }

  async createIssue(
    connection: IssueTrackerConnection,
    input: CreateIssueInput,
  ): Promise<JiraIssue> {
    const created = createdIssueSchema.parse(
      await this.request(connection, '/rest/api/2/issue', {
        method: 'POST',
        body: JSON.stringify({
          fields: {
            project: { key: input.projectKey },
            issuetype: { name: input.issueType },
            summary: input.summary,
            description: input.description,
          },
        }),
      }),
    );
    return this.getIssue(connection, created.key);
  }

  private async request(
    connection: IssueTrackerConnection,
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    await this.urlPolicy.assertAllowed(connection.baseUrl);
    const token = connection.credentials.personalAccessToken;
    if (!token)
      throw new IssueTrackerRequestError('authentication', 'Jira credentials are missing');

    let response: Response;
    try {
      response = await fetch(`${connection.baseUrl}${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          ...(init.body ? { 'content-type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new IssueTrackerRequestError('unavailable', 'Jira could not be reached');
    }

    if (response.status === 401 || response.status === 403) {
      throw new IssueTrackerRequestError('authentication', 'Jira rejected the credentials');
    }
    if (response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      throw new IssueTrackerRequestError(
        'rate_limited',
        'Jira rate limit was reached',
        Number.isFinite(retryAfter) ? retryAfter : undefined,
      );
    }
    if (!response.ok) {
      throw new IssueTrackerRequestError('unavailable', `Jira returned HTTP ${response.status}`);
    }

    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(contentLength) && contentLength > this.config.maxResponseBytes) {
      throw new IssueTrackerRequestError('invalid_response', 'Jira response was too large');
    }
    const body = await response.text();
    if (Buffer.byteLength(body) > this.config.maxResponseBytes) {
      throw new IssueTrackerRequestError('invalid_response', 'Jira response was too large');
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new IssueTrackerRequestError('invalid_response', 'Jira returned invalid JSON');
    }
  }

  private toIssue(
    connection: IssueTrackerConnection,
    issue: z.infer<typeof issueSchema>,
  ): JiraIssue {
    return {
      id: issue.id,
      key: issue.key,
      summary: issue.fields.summary,
      url: `${connection.baseUrl}/browse/${encodeURIComponent(issue.key)}`,
      status: issue.fields.status,
      issueType: issue.fields.issuetype,
    };
  }
}
