import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../../app.module';
import { configureApplication } from '../../../../configure-application';

describe('health endpoint', () => {
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

  it('returns API readiness', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-request-id': 'health-check-42' },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['x-request-id']).toBe('health-check-42');
    expect(response.json()).toEqual({
      service: 'api',
      status: 'ok',
    });
  });

  it('returns a generated request ID in error responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/missing' });

    expect(response.statusCode, response.body).toBe(404);
    const requestId = response.headers['x-request-id'];
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.json().error).toMatchObject({ code: 'http_error', requestId });
  });

  it('exposes Prometheus metrics without tenant or user dimensions', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/health' });
    const response = await app.inject({ method: 'GET', url: '/api/v1/metrics' });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('caselog_http_requests_total');
    expect(response.body).toContain('route="/api/v1/health"');
    expect(response.body).not.toMatch(/organization|tenant|user/i);
  });

  it('serves a typed OpenAPI contract', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });

    expect(response.statusCode, response.body).toBe(200);
    const document = response.json();
    expect(document).toMatchObject({
      openapi: '3.1.0',
      info: { title: 'Caselog API', version: '1.0.0' },
    });
    expect(document.paths['/api/v1/auth/login'].post.responses['200'].content).toBeDefined();
    expect(
      document.paths['/api/v1/projects/{projectSlug}/runs'].post.responses['201'].content,
    ).toBeDefined();
    expect(document.components.schemas.SessionResponseDto).toBeDefined();
    expect(document.components.schemas.ApiErrorResponseDto).toBeDefined();

    const generatedDocument = JSON.parse(
      await readFile(resolve(process.cwd(), 'openapi.json'), 'utf8'),
    );
    expect(document).toEqual(generatedDocument);
  });
});
