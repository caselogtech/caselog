import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { configureApplication } from './configure-application';
import { createHttpServerConfig } from './core/config/http-server.config';
import { loadLocalEnvironment } from './core/config/environment';

loadLocalEnvironment();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(createHttpServerConfig()),
  );
  await configureApplication(app);

  const port = Number.parseInt(process.env.API_PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
