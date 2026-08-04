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
});
