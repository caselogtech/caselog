import type { StaffOperator } from '@caselog/schemas';
import { describe, expect, it, vi } from 'vitest';
import { ResourceNotFoundError } from '../../../common/errors/domain.error';
import { StaffAccessService } from '../../application/services/staff-access.service';

const principal = {
  sub: '11111111-1111-4111-8111-111111111111',
  sid: '22222222-2222-4222-8222-222222222222',
  tokenType: 'session' as const,
};

const operator: StaffOperator = {
  userId: principal.sub,
  email: 'owner@example.com',
  displayName: 'Cloud Owner',
  role: 'owner',
  accessExpiresAt: '2099-09-04T12:00:00.000Z',
  disabledAt: null,
  createdAt: '2026-09-04T12:00:00.000Z',
};

describe('StaffAccessService', () => {
  it('keeps the managed staff boundary unavailable in self-hosted mode', async () => {
    const repository = { current: vi.fn(), bootstrap: vi.fn() };
    const service = new StaffAccessService(
      repository as never,
      { current: () => ({ deployment: 'self_hosted' }) } as never,
      { bootstrapAccessHours: 24 },
    );

    await expect(service.authenticate(principal)).rejects.toBeInstanceOf(ResourceNotFoundError);
    expect(repository.current).not.toHaveBeenCalled();
  });

  it('uses the database-backed operator on every request', async () => {
    const repository = { current: vi.fn().mockResolvedValue(operator), bootstrap: vi.fn() };
    const service = new StaffAccessService(
      repository as never,
      { current: () => ({ deployment: 'managed' }) } as never,
      { bootstrapAccessHours: 24 },
    );

    await expect(service.authenticate(principal)).resolves.toEqual(operator);
    expect(repository.current).toHaveBeenCalledWith(principal.sub);
    expect(repository.bootstrap).not.toHaveBeenCalled();
  });

  it('offers one configured bootstrap after no active operator is found', async () => {
    const repository = {
      current: vi.fn().mockResolvedValue(undefined),
      bootstrap: vi.fn().mockResolvedValue(operator),
    };
    const service = new StaffAccessService(
      repository as never,
      { current: () => ({ deployment: 'managed' }) } as never,
      { bootstrapEmail: operator.email, bootstrapAccessHours: 24 },
    );

    await expect(service.authenticate(principal)).resolves.toEqual(operator);
    expect(repository.bootstrap).toHaveBeenCalledWith(
      principal.sub,
      operator.email,
      expect.any(Date),
    );
  });
});
