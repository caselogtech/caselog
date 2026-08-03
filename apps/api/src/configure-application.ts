import fastifyCookie from '@fastify/cookie';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export async function configureApplication(app: NestFastifyApplication): Promise<void> {
  // Nest's adapter keeps its own Fastify type instance; the plugin is runtime-compatible.
  const cookiePlugin = fastifyCookie as unknown as Parameters<
    NestFastifyApplication['register']
  >[0];
  await app.register(cookiePlugin);
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(['application/xml', 'text/xml'], (_request, payload, done) => {
      done(null, payload);
    });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
}
