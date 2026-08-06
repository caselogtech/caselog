import {
  type ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import {
  AuthenticationFailedError,
  AuthorizationDeniedError,
  DomainError,
  EmailVerificationRequiredError,
  ExternalServiceError,
  InvalidSessionError,
  PayloadTooLargeError,
  ResourceConflictError,
  ResourceNotFoundError,
  UnsupportedMediaTypeError,
} from '../errors/domain.error';

type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const { status, body } = this.toResponse(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception);
    }

    response.header('Cache-Control', 'no-store').status(status).send(body);
  }

  private toResponse(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof ZodValidationException) {
      const validationError = exception.getZodError() as ZodError;
      return {
        status: HttpStatus.BAD_REQUEST,
        body: this.body('validation_failed', 'Request validation failed', {
          issues: validationError.issues.map(({ code, message, path }) => ({
            code,
            message,
            path,
          })),
        }),
      };
    }

    if (exception instanceof DomainError) {
      return {
        status: this.domainStatus(exception),
        body: this.body(exception.code, exception.message, exception.details),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = status === HttpStatus.TOO_MANY_REQUESTS ? 'rate_limited' : 'http_error';
      return { status, body: this.body(code, exception.message) };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: this.body('internal_error', 'An unexpected error occurred'),
    };
  }

  private domainStatus(error: DomainError): number {
    if (error instanceof AuthenticationFailedError || error instanceof InvalidSessionError) {
      return HttpStatus.UNAUTHORIZED;
    }
    if (error instanceof ResourceConflictError) {
      return HttpStatus.CONFLICT;
    }
    if (
      error instanceof EmailVerificationRequiredError ||
      error instanceof AuthorizationDeniedError
    ) {
      return HttpStatus.FORBIDDEN;
    }
    if (error instanceof ResourceNotFoundError) {
      return HttpStatus.NOT_FOUND;
    }
    if (error instanceof PayloadTooLargeError) return HttpStatus.PAYLOAD_TOO_LARGE;
    if (error instanceof UnsupportedMediaTypeError) return HttpStatus.UNSUPPORTED_MEDIA_TYPE;
    if (error instanceof ExternalServiceError) return HttpStatus.BAD_GATEWAY;
    return HttpStatus.BAD_REQUEST;
  }

  private body(code: string, message: string, details: Record<string, unknown> = {}): ApiErrorBody {
    return { error: { code, message, details } };
  }
}
