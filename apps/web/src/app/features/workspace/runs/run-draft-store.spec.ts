import { TestBed } from '@angular/core/testing';
import { RunDraftStore, type RunDraftContext } from './run-draft-store';

const context: RunDraftContext = {
  userId: '882c64fe-a728-40a0-91a9-96c74f585895',
  workspaceSlug: 'acme',
  projectSlug: 'authentication',
  runId: 'b101eace-107c-4177-8d7c-f4f052785c16',
  itemId: 'f230fe74-dd2d-40db-a0a4-21a8597526ef',
};

describe('RunDraftStore', () => {
  let store: RunDraftStore;

  beforeEach(() => {
    localStorage.clear();
    store = TestBed.inject(RunDraftStore);
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('isolates and restores a validated draft for one run item', () => {
    const saved = store.save(context, {
      comment: 'Interrupted execution',
      elapsedSeconds: 42,
      stepStatuses: { 0: 'f03a1a64-f159-4f39-86ca-c21b135d6815' },
    });

    expect(store.load(context)).toEqual(saved);
    expect(store.load({ ...context, userId: '98ada1cd-9d9b-4385-8263-47c3f4909948' })).toBeNull();
    expect(store.load({ ...context, itemId: '7aab808f-07cd-4576-8912-e79d39a12f3b' })).toBeNull();
  });

  it('removes a submitted draft', () => {
    store.save(context, { comment: 'Ready', elapsedSeconds: 1, stepStatuses: {} });

    expect(store.remove(context)).toBe(true);
    expect(store.load(context)).toBeNull();
  });

  it('expires an abandoned draft after 30 days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));
    store.save(context, { comment: 'Old draft', elapsedSeconds: 1, stepStatuses: {} });
    vi.setSystemTime(new Date('2026-09-03T00:00:00.000Z'));

    expect(store.load(context)).toBeNull();
  });
});
