export type LinkIssueSnapshot = {
  id: string;
  key: string;
  title: string;
  url: string;
  issueType: string;
  status: { id: string; name: string } | null;
};

export type IssueLinkResult<T> =
  | { kind: 'found'; value: T }
  | { kind: 'project_not_found' }
  | { kind: 'case_not_found' }
  | { kind: 'run_not_found' }
  | { kind: 'item_not_found' }
  | { kind: 'result_not_found' }
  | { kind: 'connection_not_found' }
  | { kind: 'link_not_found' };
