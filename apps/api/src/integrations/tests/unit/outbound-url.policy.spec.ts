import { describe, expect, it } from 'vitest';
import { OutboundUrlPolicy } from '../../infrastructure/adapters/outbound-url.policy';

describe('OutboundUrlPolicy', () => {
  const policy = new OutboundUrlPolicy({
    allowPrivateNetworks: false,
    timeoutMs: 10_000,
    maxResponseBytes: 2_000_000,
  });

  it.each([
    'http://127.0.0.1',
    'http://10.0.0.10',
    'http://169.254.169.254',
    'http://[::1]',
    'http://[::ffff:127.0.0.1]',
  ])('blocks private and local destination %s', async (url) => {
    await expect(policy.assertAllowed(url)).rejects.toThrow('not allowed');
  });

  it('allows a public literal address', async () => {
    await expect(policy.assertAllowed('https://8.8.8.8')).resolves.toBeUndefined();
  });

  it('normalizes a context path and rejects embedded credentials', () => {
    expect(policy.normalize('https://jira.example.com/jira/')).toBe(
      'https://jira.example.com/jira',
    );
    expect(() => policy.normalize('https://user:secret@jira.example.com')).toThrow(
      'cannot contain credentials',
    );
  });
});
