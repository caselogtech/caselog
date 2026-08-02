import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { TestRunItemResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../shared/api/api-error';
import { WorkspaceApi } from '../workspace-api';

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
  private readonly queryClient = inject(QueryClient);
  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly runId = this.route.snapshot.paramMap.get('runId') ?? '';
  readonly selectedItemId = signal('');
  readonly closeConfirmation = signal(false);
  readonly resultForm = this.formBuilder.group({
    comment: ['', Validators.maxLength(50_000)],
    elapsedSeconds: [0, [Validators.min(0), Validators.max(86_400)]],
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
    mutationFn: (action: 'start' | 'close') =>
      action === 'start'
        ? this.workspaceApi.startTestRun(this.workspaceSlug, this.projectSlug, this.runId)
        : this.workspaceApi.closeTestRun(this.workspaceSlug, this.projectSlug, this.runId),
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
    mutationFn: (statusId: string) => {
      const value = this.resultForm.getRawValue();
      return this.workspaceApi.recordTestResult(
        this.workspaceSlug,
        this.projectSlug,
        this.runId,
        this.selectedItem()?.id ?? '',
        {
          statusId,
          comment: value.comment.trim() || undefined,
          elapsedMs: value.elapsedSeconds > 0 ? value.elapsedSeconds * 1_000 : undefined,
        },
      );
    },
    onSuccess: async () => {
      this.resultForm.reset();
      await this.invalidateRun();
    },
  }));

  selectItem(itemId: string): void {
    this.selectedItemId.set(itemId);
  }

  assign(itemId: string, assigneeId: string): void {
    this.assignment.mutate({ itemId, assigneeId: assigneeId || null });
  }

  record(statusId: string): void {
    if (this.canExecute() && this.selectedItem() && !this.result.isPending()) {
      this.result.mutate(statusId);
    }
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
}
