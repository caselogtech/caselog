export class CliInputError extends Error {
  override readonly name = 'CliInputError';
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseApiUrl(value: string | undefined): URL {
  let url: URL;
  try {
    url = new URL(value?.trim() || 'http://localhost:3000/api/v1');
  } catch {
    throw new CliInputError('CASELOG_API_URL or --api-url must be a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new CliInputError('Caselog API URL must use http or https');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new CliInputError('Caselog API URL must not contain credentials, query, or fragment');
  }
  if (url.pathname === '/') url.pathname = '/api/v1/';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}
