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
