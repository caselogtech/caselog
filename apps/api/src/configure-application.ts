import fastifyCookie from '@fastify/cookie';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { setupOpenApi } from './openapi/openapi';

const JSON_BODY_LIMIT_BYTES = 10_500_000;

export async function configureApplication(app: NestFastifyApplication): Promise<void> {
  // Nest's adapter keeps its own Fastify type instance; the plugin is runtime-compatible.
  const cookiePlugin = fastifyCookie as unknown as Parameters<
    NestFastifyApplication['register']
  >[0];
  await app.register(cookiePlugin);
  const fastify = app.getHttpAdapter().getInstance();
  const { onProtoPoisoning, onConstructorPoisoning } = fastify.initialConfig;
  const defaultJsonParser = fastify.getDefaultJsonParser(
    onProtoPoisoning ?? 'error',
    onConstructorPoisoning ?? 'error',
  );
  app.useBodyParser(
    'application/json',
    { bodyLimit: JSON_BODY_LIMIT_BYTES },
    (request, body, done) =>
      defaultJsonParser(
        request as Parameters<typeof defaultJsonParser>[0],
        body.toString('utf8'),
        done,
      ),
  );
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(['application/xml', 'text/xml'], (_request, payload, done) => {
      done(null, payload);
    });
  app.setGlobalPrefix('api/v1');
  setupOpenApi(app);
  app.enableShutdownHooks();
}
