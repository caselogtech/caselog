import { SetMetadata } from '@nestjs/common';
import type { ApiTokenScope } from '@caselog/schemas';

export const API_TOKEN_SCOPES = Symbol('api-token-scopes');

export const RequireApiTokenScopes = (...scopes: ApiTokenScope[]): MethodDecorator =>
  SetMetadata(API_TOKEN_SCOPES, scopes);
