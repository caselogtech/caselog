export abstract class DomainError extends Error {
  protected constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AuthenticationFailedError extends DomainError {
  constructor() {
    super('invalid_credentials', 'Email or password is incorrect');
  }
}

export class InvalidSessionError extends DomainError {
  constructor() {
    super('invalid_session', 'Your session is invalid or has expired');
  }
}

export class InvalidAccountTokenError extends DomainError {
  constructor() {
    super('invalid_or_expired_token', 'This link is invalid or has expired');
  }
}

export class EmailVerificationRequiredError extends DomainError {
  constructor() {
    super('email_verification_required', 'Verify your email before creating a workspace');
  }
}

export class AuthorizationDeniedError extends DomainError {
  constructor() {
    super('insufficient_permissions', 'You do not have permission to perform this action');
  }
}

export class ResourceConflictError extends DomainError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(code, message, details);
  }
}

export class ResourceNotFoundError extends DomainError {
  constructor(resource: string) {
    super('not_found', 'The requested resource was not found', { resource });
  }
}

export class InvalidPayloadError extends DomainError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(code, message, details);
  }
}

export class PayloadTooLargeError extends DomainError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(code, message, details);
  }
}

export class UnsupportedMediaTypeError extends DomainError {
  constructor(expected: string) {
    super('unsupported_media_type', `Content-Type must be ${expected}`, { expected });
  }
}

export class ExternalServiceError extends DomainError {
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(code, message, details);
  }
}
