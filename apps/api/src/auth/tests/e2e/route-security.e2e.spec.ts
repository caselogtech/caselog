import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';

const PUBLIC_OPERATIONS = new Set([
  'GET /api/v1/health',
  'GET /api/v1/invitations/{token}',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/email/verify',
  'POST /api/v1/auth/password/forgot',
  'POST /api/v1/auth/password/reset',
]);

const HTTP_METHODS = new Set(['delete', 'get', 'patch', 'post', 'put']);
const PLACEHOLDER = '00000000-0000-4000-8000-000000000000';

type OpenApiOperation = { security?: Array<Record<string, unknown>> };
type OpenApiDocument = { paths: Record<string, Record<string, OpenApiOperation>> };
type MatrixMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

describe('API route security matrix', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('declares authentication and rejects anonymous access for every non-public operation', async () => {
    const contract = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    const operations = apiOperations(contract.json() as OpenApiDocument);
    const secured = operations.filter(({ key }) => !PUBLIC_OPERATIONS.has(key));

    expect(secured.length).toBeGreaterThan(60);
    expect(operations.filter(({ key }) => PUBLIC_OPERATIONS.has(key))).toHaveLength(
      PUBLIC_OPERATIONS.size,
    );

    for (const operation of secured) {
      expect(operation.security, `${operation.key} has no authentication scheme`).not.toEqual([]);
      const response = await app.inject({
        method: operation.method,
        url: operation.path.replaceAll(/\{[^}]+\}/g, PLACEHOLDER),
      });
      expect(response.statusCode, `${operation.key} accepted an anonymous request`).toBe(401);
    }
  });
});

function apiOperations(document: OpenApiDocument) {
  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem)
      .filter(([method]) => HTTP_METHODS.has(method))
      .map(([method, operation]) => ({
        key: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase() as MatrixMethod,
        path,
        security: operation.security ?? [],
      })),
  );
}
