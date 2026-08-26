import { describe, expect, it } from 'vitest';
import {
  canTransitionRelease,
  isMutableReleaseState,
} from '../../domain/policies/release-lifecycle.policy';

describe('release lifecycle policy', () => {
  it('allows only forward lifecycle transitions', () => {
    expect(canTransitionRelease('draft', 'active')).toBe(true);
    expect(canTransitionRelease('draft', 'cancelled')).toBe(true);
    expect(canTransitionRelease('active', 'released')).toBe(true);
    expect(canTransitionRelease('active', 'cancelled')).toBe(true);
    expect(canTransitionRelease('released', 'active')).toBe(false);
    expect(canTransitionRelease('cancelled', 'draft')).toBe(false);
  });

  it('treats only draft and active releases as mutable containers', () => {
    expect(isMutableReleaseState('draft')).toBe(true);
    expect(isMutableReleaseState('active')).toBe(true);
    expect(isMutableReleaseState('released')).toBe(false);
    expect(isMutableReleaseState('cancelled')).toBe(false);
  });
});
