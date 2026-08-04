import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module';
import { configureApplication } from '../configure-application';
import { loadLocalEnvironment } from '../core/config/environment';
import { createOpenApiDocument } from './openapi';

loadLocalEnvironment();

async function generateOpenApi(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await configureApplication(app);

  const outputPath = resolve(process.cwd(), 'openapi.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`, 'utf8');
  await app.close();
}

void generateOpenApi();
