import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MetricsService } from '../../core/observability/application/services/metrics.service';
import type { RequestContext } from '../../core/observability/infrastructure/context/request-context';
import type { PinoLoggerService } from '../../core/observability/infrastructure/logging/pino-logger.service';

const REQUEST_ID_HEADER = 'x-request-id';
const TRUSTED_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type RequestIdFastify = {
  addHook(
    name: 'onRequest',
    hook: (request: FastifyRequest, reply: FastifyReply, done: () => void) => void,
  ): void;
  addHook(
    name: 'onResponse',
    hook: (request: ObservedRequest, reply: FastifyReply, done: () => void) => void,
  ): void;
};

type ObservedRequest = FastifyRequest & { startedAt?: bigint };

export function registerRequestObservability(
  instance: unknown,
  context: RequestContext,
  logger: PinoLoggerService,
  metrics: MetricsService,
): void {
  // Nest's Fastify adapter may resolve a separate compatible Fastify type version.
  const fastify = instance as RequestIdFastify;
  fastify.addHook('onRequest', (request, reply, done) => {
    const incoming = request.headers[REQUEST_ID_HEADER];
    request.id = isTrustedRequestId(incoming) ? incoming : randomUUID();
    (request as ObservedRequest).startedAt = process.hrtime.bigint();
    reply.header(REQUEST_ID_HEADER, request.id);
    context.run({ requestId: request.id }, done);
  });
  fastify.addHook('onResponse', (request, reply, done) => {
    const durationMs = request.startedAt
      ? Number(process.hrtime.bigint() - request.startedAt) / 1_000_000
      : 0;
    const route = request.routeOptions.url ?? 'unmatched';
    const labels = { method: request.method, route, status: String(reply.statusCode) };
    metrics.observeHttp(labels, durationMs);
    logger.log({ event: 'http.request.completed', ...labels, durationMs });
    done();
  });
}

function isTrustedRequestId(value: string | string[] | undefined): value is string {
  return typeof value === 'string' && TRUSTED_REQUEST_ID.test(value);
}
