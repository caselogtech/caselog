import { IdempotencyIdentity } from '../../state/idempotency-identity';

describe('IdempotencyIdentity', () => {
  it('keeps one retry key for identical input and rotates it when input changes', () => {
    const identity = new IdempotencyIdentity();
    const first = identity.keyFor({ key: '2026.08' });
    expect(identity.keyFor({ key: '2026.08' })).toBe(first);
    expect(identity.keyFor({ key: '2026.09' })).not.toBe(first);
  });

  it('forgets a completed request', () => {
    const identity = new IdempotencyIdentity();
    const first = identity.keyFor({ key: '2026.08' });
    identity.clear();
    expect(identity.keyFor({ key: '2026.08' })).not.toBe(first);
  });
});
