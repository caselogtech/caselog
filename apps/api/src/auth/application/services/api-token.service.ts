import { Inject, Injectable } from '@nestjs/common';
import {
  apiTokenListResponseSchema,
  apiTokenPrincipalSchema,
  createApiTokenResponseSchema,
  type ApiTokenListResponse,
  type ApiTokenPrincipal,
  type CreateApiTokenRequest,
  type CreateApiTokenResponse,
  type OrganizationAccessPrincipal,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  InvalidPayloadError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { createApiToken, hashApiToken } from '../../domain/models/api-token';
import { ApiTokenRepository } from '../../infrastructure/repositories/api-token.repository';

const MAX_TOKEN_LIFETIME_MS = 366 * 24 * 60 * 60 * 1_000;

@Injectable()
export class ApiTokenService {
  constructor(@Inject(ApiTokenRepository) private readonly apiTokens: ApiTokenRepository) {}

  async create(
    principal: OrganizationAccessPrincipal,
    request: CreateApiTokenRequest,
  ): Promise<CreateApiTokenResponse> {
    this.assertManage(principal);
    const expiresAt = new Date(request.expiresAt);
    const lifetime = expiresAt.getTime() - Date.now();
    if (lifetime <= 0 || lifetime > MAX_TOKEN_LIFETIME_MS) {
      throw new InvalidPayloadError(
        'invalid_api_token_expiry',
        'API token expiry must be in the future and no more than 366 days away',
      );
    }

    const generated = createApiToken();
    const apiToken = await this.apiTokens.create(principal.organizationId, principal.sub, {
      name: request.name,
      scopes: request.scopes,
      expiresAt,
      ...generated,
    });
    return createApiTokenResponseSchema.parse({ token: generated.token, apiToken });
  }

  async list(principal: OrganizationAccessPrincipal): Promise<ApiTokenListResponse> {
    this.assertManage(principal);
    return apiTokenListResponseSchema.parse({
      apiTokens: await this.apiTokens.list(principal.organizationId),
    });
  }

  async revoke(principal: OrganizationAccessPrincipal, tokenId: string): Promise<void> {
    this.assertManage(principal);
    if (!(await this.apiTokens.revoke(principal.organizationId, tokenId, principal.sub))) {
      throw new ResourceNotFoundError('api_token');
    }
  }

  async authenticate(token: string): Promise<ApiTokenPrincipal | undefined> {
    const principal = await this.apiTokens.authenticate(hashApiToken(token));
    return principal ? apiTokenPrincipalSchema.parse(principal) : undefined;
  }

  private assertManage(principal: OrganizationAccessPrincipal): void {
    if (principal.tokenType !== 'organization' || !['owner', 'admin'].includes(principal.role)) {
      throw new AuthorizationDeniedError();
    }
  }
}
