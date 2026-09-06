import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module';
import { configureApplication } from '../configure-application';
import { createOpenApiDocument } from './openapi';

// Document generation constructs providers without initializing their I/O lifecycle.
// Use disposable configuration so checking contracts never requires operator secrets
// or a running database, SMTP server, object store, or job queue.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://openapi:openapi@127.0.0.1:1/openapi',
  JOB_DATABASE_URL: 'postgresql://openapi:openapi@127.0.0.1:1/openapi',
  AUTH_SESSION_TOKEN_SECRET: randomBytes(32).toString('hex'),
  AUTH_ORGANIZATION_TOKEN_SECRET: randomBytes(32).toString('hex'),
  WEB_BASE_URL: 'http://localhost',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'openapi',
  S3_ACCESS_KEY: 'openapi',
  S3_SECRET_KEY: randomBytes(32).toString('hex'),
  MAIL_HOST: '127.0.0.1',
  MAIL_PORT: '1',
  MAIL_FROM: 'openapi@example.invalid',
});

async function generateOpenApi(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  try {
    await configureApplication(app);
    const outputPath = resolve(process.cwd(), 'openapi.json');
    const document = `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`;
    if (process.argv.includes('--check')) {
      if ((await readFile(outputPath, 'utf8')) !== document) {
        throw new Error('OpenAPI differs from the current API. Run pnpm openapi:generate.');
      }
      process.stdout.write('OpenAPI matches the current API.\n');
    } else {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, document, 'utf8');
    }
  } finally {
    await app.close();
  }
}

void generateOpenApi();
