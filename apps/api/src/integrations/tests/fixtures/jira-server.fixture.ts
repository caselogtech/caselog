import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const JIRA_TOKEN = 'jira-data-center-test-token';
export const ROTATED_JIRA_TOKEN = 'jira-data-center-rotated-token';

export type JiraServerState = {
  createIssueCount: number;
  createdIssuePayload: {
    fields?: { description?: string; summary?: string; project?: { key?: string } };
  } | null;
  uploadedEvidence: string;
  linkedIssueStatus: { id: string; name: string };
  linkedIssueMissing: boolean;
};

export type JiraServerFixture = {
  baseUrl: string;
  state: JiraServerState;
  close(): Promise<void>;
};

export async function startJiraServer(): Promise<JiraServerFixture> {
  const state: JiraServerState = {
    createIssueCount: 0,
    createdIssuePayload: null,
    uploadedEvidence: '',
    linkedIssueStatus: { id: '1', name: 'Open' },
    linkedIssueMissing: false,
  };
  const server = createServer((request, response) => handleRequest(state, request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    state,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function handleRequest(
  state: JiraServerState,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const acceptedTokens = new Set([`Bearer ${JIRA_TOKEN}`, `Bearer ${ROTATED_JIRA_TOKEN}`]);
  if (!acceptedTokens.has(request.headers.authorization ?? '')) {
    sendJson(response, 401, { message: 'Unauthorized' });
    return;
  }

  const url = new URL(request.url ?? '/', 'http://jira.test');
  if (request.method === 'GET' && url.pathname === '/rest/api/2/myself') {
    sendJson(response, 200, { key: 'qa-owner', displayName: 'QA Owner' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/rest/api/2/project') {
    sendJson(response, 200, [
      { id: '10000', key: 'QA', name: 'Quality', projectTypeKey: 'software' },
    ]);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/rest/api/2/issue/QA-42') {
    if (state.linkedIssueMissing) {
      sendJson(response, 404, { message: 'Issue does not exist' });
      return;
    }
    sendJson(response, 200, {
      id: '1042',
      key: 'QA-42',
      fields: {
        summary: 'Checkout fails',
        status: state.linkedIssueStatus,
        issuetype: { id: '10001', name: 'Bug' },
      },
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/rest/api/2/issue') {
    readBody(request, (body) => {
      state.createIssueCount += 1;
      state.createdIssuePayload = JSON.parse(
        body.toString('utf8'),
      ) as JiraServerState['createdIssuePayload'];
      if (state.createdIssuePayload?.fields?.project?.key === 'AMBIG') {
        response.destroy();
        return;
      }
      sendJson(response, 201, { id: '1099', key: 'QA-99' });
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/rest/api/2/issue/QA-99/attachments') {
    readBody(request, (body) => {
      state.uploadedEvidence = body.toString('utf8');
      sendJson(response, 200, [{ id: 'attachment-1', filename: 'checkout-failure.png' }]);
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/rest/api/2/search') {
    readBody(request, (body) => {
      const query = JSON.parse(body.toString('utf8')) as {
        startAt: number;
        maxResults: number;
      };
      sendJson(response, 200, {
        startAt: query.startAt,
        maxResults: query.maxResults,
        total: 1,
        issues: [
          {
            id: '1042',
            key: 'QA-42',
            fields: {
              summary: 'Checkout fails',
              status: { id: '1', name: 'Open' },
              issuetype: { id: '10001', name: 'Bug' },
            },
          },
        ],
      });
    });
    return;
  }

  sendJson(response, 404, { message: 'Not found' });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage, complete: (body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  request.on('end', () => complete(Buffer.concat(chunks)));
}
