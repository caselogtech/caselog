import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  HostListener,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { CreateTestResultRequest, TestRunItemResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { WorkspaceApi } from '../../data-access/workspace-api';
import { RunDraftStore, type RunDraftContext } from '../../state/run-draft-store';

@Component({
  selector: 'app-run-detail',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './run-detail.html',
  styleUrl: './run-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly browserSession = inject(BrowserSession);
  private readonly queryClient = inject(QueryClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly draftStore = inject(RunDraftStore);
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private timerStartedAt: number | null = null;
  private timerBaseSeconds = 0;
  private activeDraftItemId = '';
  private suppressDraftSave = false;
  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly runId = this.route.snapshot.paramMap.get('runId') ?? '';
  readonly selectedItemId = signal(this.route.snapshot.queryParamMap.get('item') ?? '');
  readonly stepStatuses = signal<Record<number, string>>({});
  readonly timerRunning = signal(false);
  readonly online = signal(typeof navigator === 'undefined' || navigator.onLine);
  readonly draftSavedAt = signal<string | null>(null);
  readonly draftRestored = signal(false);
  readonly draftStorageError = signal(false);
  readonly closeConfirmation = signal(false);
  readonly resultForm = this.formBuilder.group({
    comment: ['', Validators.maxLength(50_000)],
    elapsedSeconds: [
      0,
      [Validators.required, Validators.min(0), Validators.max(86_400), Validators.pattern(/^\d+$/)],
    ],
  });

  readonly detail = injectInfiniteQuery(() => ({
    queryKey: ['test-run', this.workspaceSlug, this.projectSlug, this.runId],
    queryFn: ({ pageParam }) =>
      this.workspaceApi.testRun(
        this.workspaceSlug,
        this.projectSlug,
        this.runId,
        pageParam ?? undefined,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));

  readonly items = computed(() => this.detail.data()?.pages.flatMap(({ items }) => items) ?? []);
  readonly metadata = computed(() => this.detail.data()?.pages[0] ?? null);
  readonly selectedItem = computed(
    () => this.items().find(({ id }) => id === this.selectedItemId()) ?? this.items()[0] ?? null,
  );
  readonly canManage = computed(() =>
    ['owner', 'admin', 'lead'].includes(this.workspaceSession.role() ?? ''),
  );
  readonly canExecute = computed(
    () => this.workspaceSession.role() !== 'read_only' && this.metadata()?.run.status === 'active',
  );
  readonly lifecycle = injectMutation(() => ({
    mutationFn: (action: 'start' | 'close') => {
      if (action === 'close') {
        this.pauseTimer();
        this.persistDraft();
      }
      return action === 'start'
        ? this.workspaceApi.startTestRun(this.workspaceSlug, this.projectSlug, this.runId)
        : this.workspaceApi.closeTestRun(this.workspaceSlug, this.projectSlug, this.runId);
    },
    onSuccess: () => {
      this.closeConfirmation.set(false);
      return this.invalidateRun();
    },
  }));

  readonly assignment = injectMutation(() => ({
    mutationFn: (input: { itemId: string; assigneeId: string | null }) =>
      this.workspaceApi.assignTestRunItem(
        this.workspaceSlug,
        this.projectSlug,
        this.runId,
        input.itemId,
        input.assigneeId,
      ),
    onSuccess: () => this.invalidateRun(),
  }));

  readonly result = injectMutation(() => ({
    mutationFn: ({ itemId, request }: { itemId: string; request: CreateTestResultRequest }) =>
      this.workspaceApi.recordTestResult(
        this.workspaceSlug,
        this.projectSlug,
        this.runId,
        itemId,
        request,
      ),
    onSuccess: async (_response, { itemId }) => {
      const context = this.draftContext(itemId);
      if (context) this.draftStore.remove(context);
      if (this.selectedItem()?.id === itemId) {
        this.pauseTimer();
        this.clearExecutionForm();
      }
      await this.invalidateRun();
    },
  }));

  constructor() {
    effect(() => {
      const itemId = this.selectedItem()?.id;
      if (itemId && itemId !== this.activeDraftItemId) {
        untracked(() => this.restoreDraft(itemId));
      }
    });
    this.resultForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.persistDraft());
    this.destroyRef.onDestroy(() => {
      this.persistDraft();
      this.stopTimerInterval();
    });
  }

  selectItem(itemId: string): void {
    this.persistDraft();
    this.pauseTimer();
    this.selectedItemId.set(itemId);
    this.restoreDraft(itemId);
  }

  chooseStepStatus(position: number, statusId: string): void {
    this.stepStatuses.update((statuses) => ({ ...statuses, [position]: statusId }));
    this.persistDraft();
  }

  isStepStatusSelected(position: number, statusId: string): boolean {
    return this.stepStatuses()[position] === statusId;
  }

  assign(itemId: string, assigneeId: string): void {
    this.assignment.mutate({ itemId, assigneeId: assigneeId || null });
  }

  record(statusId: string): void {
    const item = this.selectedItem();
    if (
      this.canExecute() &&
      this.online() &&
      item &&
      this.resultForm.valid &&
      !this.result.isPending()
    ) {
      this.pauseTimer();
      this.persistDraft();
      const value = this.resultForm.getRawValue();
      this.result.mutate({
        itemId: item.id,
        request: {
          statusId,
          comment: value.comment.trim() || undefined,
          elapsedMs: value.elapsedSeconds > 0 ? value.elapsedSeconds * 1_000 : undefined,
          stepResults: Object.entries(this.stepStatuses()).map(([position, stepStatusId]) => ({
            position: Number(position),
            statusId: stepStatusId,
          })),
        },
      });
    }
  }

  startTimer(): void {
    if (
      this.timerHandle ||
      !this.canExecute() ||
      this.resultForm.controls.elapsedSeconds.invalid ||
      this.resultForm.controls.elapsedSeconds.value >= 86_400
    ) {
      return;
    }
    this.timerRunning.set(true);
    this.timerBaseSeconds = this.resultForm.controls.elapsedSeconds.value;
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
    this.resultForm.controls.elapsedSeconds.setValue(0);
  }

  steps(item: TestRunItemResponse): Array<{ action: string; expected?: string }> {
    const content = item.caseVersion.content as {
      steps?: Array<{ action: string; expected?: string }>;
    };
    return content.steps ?? [];
  }

  textContent(item: TestRunItemResponse): string {
    const content = item.caseVersion.content as {
      text?: string;
      charter?: string;
      gherkin?: string;
    };
    return content.text ?? content.charter ?? content.gherkin ?? '';
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.lifecycle.error() ??
        this.assignment.error() ??
        this.result.error() ??
        this.detail.error(),
    );
  }

  @HostListener('window:online')
  handleOnline(): void {
    this.online.set(true);
  }

  @HostListener('window:offline')
  handleOffline(): void {
    this.online.set(false);
    this.persistDraft();
  }

  @HostListener('document:keydown', ['$event'])
  handleShortcut(event: KeyboardEvent): void {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    )
      return;
    if (event.key === 'Enter') {
      const index = this.items().findIndex(({ id }) => id === this.selectedItem()?.id);
      const next = this.items()[index + 1];
      if (next) {
        event.preventDefault();
        this.selectItem(next.id);
      }
      return;
    }
    const statusKey = { p: 'passed', f: 'failed', b: 'blocked' }[event.key.toLowerCase()];
    const status = this.metadata()?.statuses.find(({ key }) => key === statusKey);
    if (status && this.canExecute()) {
      event.preventDefault();
      this.record(status.id);
    }
  }

  private invalidateRun(): Promise<void> {
    void this.queryClient.invalidateQueries({
      queryKey: ['test-runs', this.workspaceSlug, this.projectSlug],
    });
    return this.queryClient.invalidateQueries({
      queryKey: ['test-run', this.workspaceSlug, this.projectSlug, this.runId],
    });
  }

  private persistDraft(): void {
    if (this.suppressDraftSave) return;
    const itemId = this.selectedItem()?.id;
    if (!itemId) return;
    const context = this.draftContext(itemId);
    if (!context) return;
    const value = this.resultForm.getRawValue();
    const elapsedSeconds = Number.isFinite(value.elapsedSeconds) ? value.elapsedSeconds : 0;
    const stepStatuses = this.stepStatuses();
    const hasContent =
      value.comment.length > 0 || elapsedSeconds > 0 || Object.keys(stepStatuses).length > 0;
    if (!hasContent) {
      this.draftStorageError.set(!this.draftStore.remove(context));
      this.draftSavedAt.set(null);
      this.draftRestored.set(false);
      return;
    }
    const draft = this.draftStore.save(context, {
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

  private restoreDraft(itemId: string): void {
    this.activeDraftItemId = itemId;
    this.suppressDraftSave = true;
    this.resultForm.reset({ comment: '', elapsedSeconds: 0 }, { emitEvent: false });
    this.stepStatuses.set({});
    const context = this.draftContext(itemId);
    const draft = context ? this.draftStore.load(context) : null;
    if (draft) {
      this.resultForm.setValue(
        { comment: draft.comment, elapsedSeconds: draft.elapsedSeconds },
        { emitEvent: false },
      );
      const allowedStatuses = new Set(this.metadata()?.statuses.map(({ id }) => id) ?? []);
      const item = this.items().find(({ id }) => id === itemId);
      const stepCount = item ? this.steps(item).length : 0;
      this.stepStatuses.set(
        Object.fromEntries(
          Object.entries(draft.stepStatuses)
            .filter(
              ([position, statusId]) =>
                Number(position) < stepCount && allowedStatuses.has(statusId),
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

  private clearExecutionForm(): void {
    this.suppressDraftSave = true;
    this.resultForm.reset({ comment: '', elapsedSeconds: 0 }, { emitEvent: false });
    this.stepStatuses.set({});
    this.draftSavedAt.set(null);
    this.draftRestored.set(false);
    this.draftStorageError.set(false);
    this.suppressDraftSave = false;
  }

  private draftContext(itemId: string): RunDraftContext | null {
    const userId = this.browserSession.user()?.id;
    if (!userId) return null;
    return {
      userId,
      workspaceSlug: this.workspaceSlug,
      projectSlug: this.projectSlug,
      runId: this.runId,
      itemId,
    };
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
    if (elapsed !== this.resultForm.controls.elapsedSeconds.value) {
      this.resultForm.controls.elapsedSeconds.setValue(elapsed);
    }
    if (elapsed === 86_400) {
      this.stopTimerInterval();
      this.timerRunning.set(false);
    }
  }
}
