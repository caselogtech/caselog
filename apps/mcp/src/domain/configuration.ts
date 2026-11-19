export type McpConfiguration = { apiUrl: string; token: string };

export function readConfiguration(
  environment: Record<string, string | undefined>,
): McpConfiguration {
  let url: URL;
  try {
    url = new URL(environment.CASELOG_API_URL ?? '');
  } catch {
    throw new Error('Set CASELOG_API_URL to an absolute Caselog API URL ending in /api/v1');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.replace(/\/$/, '').endsWith('/api/v1')
  )
    throw new Error(
      'CASELOG_API_URL requires HTTPS (or loopback HTTP), an /api/v1 path, and no credentials, query or fragment',
    );
  const token = environment.CASELOG_TOKEN ?? '';
  if (!/^clg_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error('Set CASELOG_TOKEN to a workspace API token');
  }
  return { apiUrl: url.toString().replace(/\/$/, ''), token };
}
