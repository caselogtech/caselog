import type {
  IssueTrackerIdentity,
  JiraIssue,
  JiraIssueSearchRequest,
  JiraIssueSearchResponse,
  JiraProject,
} from '@caselog/schemas';

export type IssueTrackerConnection = {
  baseUrl: string;
  credentials: Record<string, string>;
};

export type CreateIssueInput = {
  projectKey: string;
  issueType: string;
  summary: string;
  description: string;
};

export abstract class IssueTrackerProvider {
  abstract readonly provider: string;
  abstract readonly deployment: string;

  abstract verifyConnection(connection: IssueTrackerConnection): Promise<IssueTrackerIdentity>;
  abstract listProjects(connection: IssueTrackerConnection): Promise<JiraProject[]>;
  abstract searchIssues(
    connection: IssueTrackerConnection,
    request: JiraIssueSearchRequest,
  ): Promise<JiraIssueSearchResponse>;
  abstract getIssue(connection: IssueTrackerConnection, issueKey: string): Promise<JiraIssue>;
  abstract createIssue(
    connection: IssueTrackerConnection,
    input: CreateIssueInput,
  ): Promise<JiraIssue>;
}

export const ISSUE_TRACKER_PROVIDERS = Symbol('ISSUE_TRACKER_PROVIDERS');
