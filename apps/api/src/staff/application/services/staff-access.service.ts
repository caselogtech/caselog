import { Inject, Injectable } from '@nestjs/common';
import type { SessionPrincipal, StaffOperator } from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { InstanceCapabilitiesService } from '../../../instance/public-api';
import { StaffRepository } from '../../infrastructure/repositories/staff.repository';
import { STAFF_CONFIG, type StaffConfig } from '../../infrastructure/config/staff.config';

@Injectable()
export class StaffAccessService {
  constructor(
    @Inject(StaffRepository) private readonly staff: StaffRepository,
    @Inject(InstanceCapabilitiesService)
    private readonly capabilities: InstanceCapabilitiesService,
    @Inject(STAFF_CONFIG) private readonly config: StaffConfig,
  ) {}

  async authenticate(principal: SessionPrincipal): Promise<StaffOperator> {
    if (this.capabilities.current().deployment !== 'managed') {
      throw new ResourceNotFoundError('staff_console');
    }

    const current = await this.staff.current(principal.sub);
    if (current) return current;

    if (this.config.bootstrapEmail) {
      const expiresAt = new Date(Date.now() + this.config.bootstrapAccessHours * 60 * 60 * 1_000);
      const bootstrapped = await this.staff.bootstrap(
        principal.sub,
        this.config.bootstrapEmail,
        expiresAt,
      );
      if (bootstrapped) return bootstrapped;
    }

    throw new AuthorizationDeniedError();
  }
}
