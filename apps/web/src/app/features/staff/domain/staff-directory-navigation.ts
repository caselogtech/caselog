import { staffWorkspaceListQuerySchema, type StaffWorkspaceListQuery } from '@caselog/schemas';

export type StaffDirectoryResource = 'users' | 'workspaces' | 'billingAccounts';

const directoryPaths: Record<StaffDirectoryResource, string> = {
  users: '/staff/users',
  workspaces: '/staff/workspaces',
  billingAccounts: '/staff/billing-accounts',
};

export function staffDirectoryUrl(
  resource: StaffDirectoryResource,
  query: StaffWorkspaceListQuery,
): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (resource === 'workspaces' && query.state !== 'all') params.set('state', query.state);
  if (query.limit !== 25) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  return directoryPaths[resource] + (params.size ? `?${params}` : '');
}

export function staffDirectoryReturnUrl(value: string | null): string | undefined {
  if (!value || value.length > 2048 || !value.startsWith('/staff/')) return undefined;
  const url = new URL(value, 'https://caselog.invalid');
  const resources: StaffDirectoryResource[] = ['users', 'workspaces', 'billingAccounts'];
  const resource = resources.find((key) => directoryPaths[key] === url.pathname);
  if (!resource || url.origin !== 'https://caselog.invalid' || url.hash) return undefined;
  const query = staffWorkspaceListQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    state: resource === 'workspaces' ? (url.searchParams.get('state') ?? undefined) : 'all',
  });
  return query.success ? staffDirectoryUrl(resource, query.data) : undefined;
}
