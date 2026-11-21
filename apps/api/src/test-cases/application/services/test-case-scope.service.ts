import { Inject, Injectable } from '@nestjs/common';
import { TestCaseScopeRepository } from '../../infrastructure/repositories/test-case-scope.repository';

@Injectable()
export class TestCaseScopeService {
  constructor(@Inject(TestCaseScopeRepository) private readonly scopes: TestCaseScopeRepository) {}
  capture(organizationId: string, projectId: string) {
    return this.scopes.capture(organizationId, projectId);
  }
}
