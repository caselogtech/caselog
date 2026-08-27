import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import type { CreateTestResultRequest } from '@caselog/schemas';
import { BrowserSession } from '../../../core/auth/browser-session';
import { RunDraftStore, type RunDraftContext } from './run-draft-store';

interface ExecutionContext extends RunDraftContext {
  allowedStatusIds: ReadonlySet<string>;
  stepCount: number;
}

interface ActivateExecutionInput {
  workspaceSlug: string;
  projectSlug: string;
  runId: string;
  itemId: string;
  stepCount: number;
  statusIds: ReadonlyArray<string>;
}

@Injectable()
export class RunExecutionSession {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly browserSession = inject(BrowserSession);
  private readonly draftStore = inject(RunDraftStore);
  private readonly destroyRef = inject(DestroyRef);
  private context: ExecutionContext | null = null;
  private suppressDraftSave = false;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private timerStartedAt: number | null = null;
  private timerBaseSeconds = 0;

  readonly stepStatuses = signal<Record<number, string>>({});
  readonly timerRunning = signal(false);
  readonly online = signal(typeof navigator === 'undefined' || navigator.onLine);
  readonly draftSavedAt = signal<string | null>(null);
  readonly draftRestored = signal(false);
  readonly draftStorageError = signal(false);
  readonly form = this.formBuilder.group({
    comment: ['', Validators.maxLength(50_000)],
    elapsedSeconds: [
      0,
      [Validators.required, Validators.min(0), Validators.max(86_400), Validators.pattern(/^\d+$/)],
    ],
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.persist());
    this.destroyRef.onDestroy(() => {
      this.persist();
      this.stopTimerInterval();
    });
  }

  activate(input: ActivateExecutionInput): void {
    if (this.context?.itemId === input.itemId) return;
    this.persist();
    this.pauseTimer();
    const userId = this.browserSession.user()?.id;
    this.context = userId
      ? {
          userId,
          workspaceSlug: input.workspaceSlug,
          projectSlug: input.projectSlug,
          runId: input.runId,
          itemId: input.itemId,
          stepCount: input.stepCount,
          allowedStatusIds: new Set(input.statusIds),
        }
      : null;
    this.restore();
  }

  chooseStepStatus(position: number, statusId: string): void {
    this.stepStatuses.update((statuses) => ({ ...statuses, [position]: statusId }));
    this.persist();
  }

  isStepStatusSelected(position: number, statusId: string): boolean {
    return this.stepStatuses()[position] === statusId;
  }

  createResultRequest(statusId: string): CreateTestResultRequest | null {
    if (this.form.invalid) return null;
    this.pauseTimer();
    this.persist();
    const value = this.form.getRawValue();
    return {
      statusId,
      comment: value.comment.trim() || undefined,
      elapsedMs: value.elapsedSeconds > 0 ? value.elapsedSeconds * 1_000 : undefined,
      stepResults: Object.entries(this.stepStatuses()).map(([position, stepStatusId]) => ({
        position: Number(position),
        statusId: stepStatusId,
      })),
    };
  }

  complete(itemId: string): void {
    if (this.context?.itemId !== itemId) return;
    this.draftStore.remove(this.context);
    this.pauseTimer();
    this.clearForm();
  }

  startTimer(): void {
    if (
      this.timerHandle ||
      this.form.controls.elapsedSeconds.invalid ||
      this.form.controls.elapsedSeconds.value >= 86_400
    ) {
      return;
    }
    this.timerRunning.set(true);
    this.timerBaseSeconds = this.form.controls.elapsedSeconds.value;
    this.timerStartedAt = Date.now();
    this.timerHandle = setInterval(() => this.updateTimer(), 1_000);
  }

  pauseTimer(): void {
    this.updateTimer();
    this.stopTimerInterval();
    this.timerRunning.set(false);
  }

  resetTimer(): void {
    this.pauseTimer();
    this.form.controls.elapsedSeconds.setValue(0);
  }

  setOnline(online: boolean): void {
    this.online.set(online);
    if (!online) this.persist();
  }

  persist(): void {
    if (this.suppressDraftSave || !this.context) return;
    const value = this.form.getRawValue();
    const elapsedSeconds = Number.isFinite(value.elapsedSeconds) ? value.elapsedSeconds : 0;
    const stepStatuses = this.stepStatuses();
    const hasContent =
      value.comment.length > 0 || elapsedSeconds > 0 || Object.keys(stepStatuses).length > 0;
    if (!hasContent) {
      this.draftStorageError.set(!this.draftStore.remove(this.context));
      this.draftSavedAt.set(null);
      this.draftRestored.set(false);
      return;
    }
    const draft = this.draftStore.save(this.context, {
      comment: value.comment,
      elapsedSeconds,
      stepStatuses,
    });
    this.draftStorageError.set(!draft);
    if (draft) {
      this.draftSavedAt.set(draft.savedAt);
      this.draftRestored.set(false);
    }
  }

  private restore(): void {
    this.suppressDraftSave = true;
    this.form.reset({ comment: '', elapsedSeconds: 0 }, { emitEvent: false });
    this.stepStatuses.set({});
    const context = this.context;
    const draft = context ? this.draftStore.load(context) : null;
    if (draft && context) {
      this.form.setValue(
        { comment: draft.comment, elapsedSeconds: draft.elapsedSeconds },
        { emitEvent: false },
      );
      this.stepStatuses.set(
        Object.fromEntries(
          Object.entries(draft.stepStatuses)
            .filter(
              ([position, statusId]) =>
                Number(position) < context.stepCount && context.allowedStatusIds.has(statusId),
            )
            .map(([position, statusId]) => [Number(position), statusId]),
        ),
      );
    }
    this.draftSavedAt.set(draft?.savedAt ?? null);
    this.draftRestored.set(Boolean(draft));
    this.draftStorageError.set(false);
    this.suppressDraftSave = false;
  }

  private clearForm(): void {
    this.suppressDraftSave = true;
    this.form.reset({ comment: '', elapsedSeconds: 0 }, { emitEvent: false });
    this.stepStatuses.set({});
    this.draftSavedAt.set(null);
    this.draftRestored.set(false);
    this.draftStorageError.set(false);
    this.suppressDraftSave = false;
  }

  private stopTimerInterval(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    this.timerStartedAt = null;
  }

  private updateTimer(): void {
    if (this.timerStartedAt === null) return;
    const elapsed = Math.min(
      this.timerBaseSeconds + Math.floor((Date.now() - this.timerStartedAt) / 1_000),
      86_400,
    );
    if (elapsed !== this.form.controls.elapsedSeconds.value) {
      this.form.controls.elapsedSeconds.setValue(elapsed);
    }
    if (elapsed === 86_400) {
      this.stopTimerInterval();
      this.timerRunning.set(false);
    }
  }
}
