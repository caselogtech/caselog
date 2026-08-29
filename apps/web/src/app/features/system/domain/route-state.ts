export const ROUTE_STATE_KINDS = ['forbidden', 'notFound', 'offline', 'serverError'] as const;

export type RouteStateKind = (typeof ROUTE_STATE_KINDS)[number];

export function routeStateKind(value: unknown): RouteStateKind {
  return ROUTE_STATE_KINDS.includes(value as RouteStateKind)
    ? (value as RouteStateKind)
    : 'notFound';
}

export function safeReturnUrl(value: string | null): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/status/')) {
    return null;
  }
  return value;
}
