import { Injectable } from '@angular/core';

const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RunDraftContext = {
  userId: string;
  workspaceSlug: string;
  projectSlug: string;
  runId: string;
  itemId: string;
};

export type RunItemDraft = {
  version: 1;
  comment: string;
  elapsedSeconds: number;
  stepStatuses: Record<string, string>;
  savedAt: string;
};

type DraftInput = Pick<RunItemDraft, 'comment' | 'elapsedSeconds' | 'stepStatuses'>;

@Injectable({ providedIn: 'root' })
export class RunDraftStore {
  load(context: RunDraftContext): RunItemDraft | null {
    const storage = this.storage();
    if (!storage) return null;
    try {
      const value: unknown = JSON.parse(storage.getItem(this.key(context)) ?? 'null');
      if (!this.isDraft(value)) return null;
      if (Date.now() - Date.parse(value.savedAt) > DRAFT_RETENTION_MS) {
        storage.removeItem(this.key(context));
        return null;
      }
      return value;
    } catch {
      return null;
    }
  }

  save(context: RunDraftContext, input: DraftInput): RunItemDraft | null {
    const storage = this.storage();
    if (!storage) return null;
    const draft: RunItemDraft = {
      version: 1,
      ...input,
      savedAt: new Date().toISOString(),
    };
    try {
      storage.setItem(this.key(context), JSON.stringify(draft));
      return draft;
    } catch {
      return null;
    }
  }

  remove(context: RunDraftContext): boolean {
    const storage = this.storage();
    if (!storage) return false;
    try {
      storage.removeItem(this.key(context));
      return true;
    } catch {
      return false;
    }
  }

  private key(context: RunDraftContext): string {
    const scope = [
      context.userId,
      context.workspaceSlug,
      context.projectSlug,
      context.runId,
      context.itemId,
    ]
      .map(encodeURIComponent)
      .join(':');
    return `caselog:run-draft:v1:${scope}`;
  }

  private storage(): Storage | null {
    return typeof localStorage === 'undefined' ? null : localStorage;
  }

  private isDraft(value: unknown): value is RunItemDraft {
    if (!value || typeof value !== 'object') return false;
    const draft = value as Partial<RunItemDraft>;
    return (
      draft.version === 1 &&
      typeof draft.comment === 'string' &&
      draft.comment.length <= 50_000 &&
      Number.isFinite(draft.elapsedSeconds) &&
      (draft.elapsedSeconds ?? -1) >= 0 &&
      (draft.elapsedSeconds ?? 86_401) <= 86_400 &&
      typeof draft.savedAt === 'string' &&
      !Number.isNaN(Date.parse(draft.savedAt)) &&
      this.isStepStatuses(draft.stepStatuses)
    );
  }

  private isStepStatuses(value: unknown): value is Record<string, string> {
    return (
      Boolean(value) &&
      typeof value === 'object' &&
      Object.entries(value as Record<string, unknown>).every(
        ([position, statusId]) =>
          /^\d{1,3}$/.test(position) &&
          Number(position) <= 199 &&
          typeof statusId === 'string' &&
          UUID_PATTERN.test(statusId),
      )
    );
  }
}
