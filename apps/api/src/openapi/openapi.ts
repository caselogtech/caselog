import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { ApiErrorResponseDto } from '../common/http/api-error-response.dto';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

export function createOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Caselog API')
    .setDescription('Public API for Caselog test management workflows.')
    .setVersion('1.0.0')
    .setOpenAPIVersion('3.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token' },
      'access-token',
    )
    .addCookieAuth('caselog_refresh', { type: 'apiKey', in: 'cookie' }, 'refresh-cookie')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ApiErrorResponseDto],
  });
  addDefaultErrorResponses(document);
  return cleanupOpenApiDoc(document, { version: '3.1' });
}

function addDefaultErrorResponses(document: OpenAPIObject): void {
  for (const path of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = path?.[method];
      if (!operation) continue;
      operation.responses.default ??= {
        description: 'API error',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponseDto' } },
        },
      };
    }
  }
}

export function setupOpenApi(app: NestFastifyApplication): void {
  SwaggerModule.setup('docs', app, createOpenApiDocument(app), {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'openapi.json',
    yamlDocumentUrl: 'openapi.yaml',
  });
}
