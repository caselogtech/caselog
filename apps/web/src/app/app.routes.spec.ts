import { RESERVED_ORGANIZATION_SLUGS } from '@caselog/schemas';
import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';

describe('application routes', () => {
  it('reserves every static top-level route from organization slugs', () => {
    const reservedSlugs = new Set<string>(RESERVED_ORGANIZATION_SLUGS);
    const staticTopLevelRoutes = [
      ...new Set(
        routes
          .map(({ path }) => path?.split('/')[0])
          .filter(
            (segment): segment is string =>
              Boolean(segment) && segment !== '**' && !segment?.startsWith(':'),
          ),
      ),
    ];

    expect(staticTopLevelRoutes.filter((segment) => !reservedSlugs.has(segment))).toEqual([]);
  });

  it('keeps reserved organization slugs unique', () => {
    expect(new Set(RESERVED_ORGANIZATION_SLUGS).size).toBe(RESERVED_ORGANIZATION_SLUGS.length);
  });

  it('renders explicit system states and keeps the wildcard as not found', () => {
    const statusRoute = routes.find(({ path }) => path === 'status');
    expect(statusRoute?.children?.map(({ path }) => path)).toEqual([
      'forbidden',
      'offline',
      'server-error',
    ]);
    expect(routes.at(-1)).toMatchObject({ path: '**', data: { kind: 'notFound' } });
  });
});
