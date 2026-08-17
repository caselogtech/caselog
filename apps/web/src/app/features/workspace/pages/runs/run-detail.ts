import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { CreateTestResultRequest, TestRunItemResponse, TestRunStatus } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { RunCaseQueue } from '../../components/run-case-queue/run-case-queue';
import { RunProgressReport } from '../../components/run-progress-report/run-progress-report';
import { WorkspaceApi } from '../../data-access/workspace-api';
import { RunExecutionSession } from '../../state/run-execution-session';

@Component({
  selector: 'app-run-detail',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    RunCaseQueue,
    RunProgressReport,
    TranslocoPipe,
  ],
  templateUrl: './run-detail.html',
  styleUrl: './run-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RunExecutionSession],
})
export class RunDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly execution = inject(RunExecutionSession);
  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly runId = this.route.snapshot.paramMap.get('runId') ?? '';
  readonly selectedItemId = signal(this.route.snapshot.queryParamMap.get('item') ?? '');
  readonly timerRunning = this.execution.timerRunning;
  readonly online = this.execution.online;
  readonly draftSavedAt = this.execution.draftSavedAt;
  readonly draftRestored = this.execution.draftRestored;
  readonly draftStorageError = this.execution.draftStorageError;
  readonly closeConfirmation = signal(false);
  readonly resultForm = this.execution.form;

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

  readonly progress = injectQuery(() => ({
    queryKey: ['run-progress', this.workspaceSlug, this.projectSlug, this.runId],
    queryFn: () => this.workspaceApi.runProgress(this.workspaceSlug, this.projectSlug, this.runId),
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
        this.execution.pauseTimer();
        this.execution.persist();
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
      this.execution.complete(itemId);
      await this.invalidateRun();
    },
  }));

  constructor() {
    effect(() => {
      const item = this.selectedItem();
      const statusIds = this.metadata()?.statuses.map(({ id }) => id) ?? [];
      if (!item) return;
      untracked(() =>
        this.execution.activate({
          workspaceSlug: this.workspaceSlug,
          projectSlug: this.projectSlug,
          runId: this.runId,
          itemId: item.id,
          stepCount: this.steps(item).length,
          statusIds,
        }),
      );
    });
  }

  selectItem(itemId: string): void {
    this.selectedItemId.set(itemId);
  }

  chooseStepStatus(position: number, statusId: string): void {
    this.execution.chooseStepStatus(position, statusId);
  }

  isStepStatusSelected(position: number, statusId: string): boolean {
    return this.execution.isStepStatusSelected(position, statusId);
  }

  assign(itemId: string, assigneeId: string): void {
    this.assignment.mutate({ itemId, assigneeId: assigneeId || null });
  }

  record(statusId: string): void {
    const item = this.selectedItem();
    if (!this.canExecute() || !this.online() || !item || this.result.isPending()) return;
    const request = this.execution.createResultRequest(statusId);
    if (request) this.result.mutate({ itemId: item.id, request });
  }

  startTimer(): void {
    if (this.canExecute()) this.execution.startTimer();
  }

  pauseTimer(): void {
    this.execution.pauseTimer();
  }

  resetTimer(): void {
    this.execution.resetTimer();
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

  statusTranslationKey(status: TestRunStatus): string {
    return {
      draft: 'workspace.runs.statuses.draft',
      active: 'workspace.runs.statuses.active',
      completed: 'workspace.runs.statuses.completed',
      archived: 'workspace.runs.statuses.archived',
    }[status];
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
    this.execution.setOnline(true);
  }

  @HostListener('window:offline')
  handleOffline(): void {
    this.execution.setOnline(false);
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
    return Promise.all([
      this.queryClient.invalidateQueries({
        queryKey: ['test-run', this.workspaceSlug, this.projectSlug, this.runId],
      }),
      this.queryClient.invalidateQueries({
        queryKey: ['run-progress', this.workspaceSlug, this.projectSlug, this.runId],
      }),
    ]).then(() => undefined);
  }
}
