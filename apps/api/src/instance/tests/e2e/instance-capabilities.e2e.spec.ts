import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { instanceCapabilitiesSchema } from '@caselog/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';

describe('instance capabilities API', () => {
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

  it('exposes the public server-owned capability contract', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/instance/capabilities',
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(instanceCapabilitiesSchema.parse(response.json())).toEqual({
      deployment: 'self_hosted',
      instanceName: 'Caselog',
      registrationMode: 'public',
      workspaceCreationEnabled: true,
      managedBillingEnabled: false,
    });
  });
});
