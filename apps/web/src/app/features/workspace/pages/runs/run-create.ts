import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectInfiniteQuery, injectMutation } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { WorkspaceApi } from '../../data-access/workspace-api';

@Component({
  selector: 'app-run-create',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './run-create.html',
  styleUrl: './run-create.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunCreate {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly canCreate = computed(() => this.workspaceSession.role() !== 'read_only');
  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    build: ['', Validators.maxLength(200)],
  });

  readonly cases = injectInfiniteQuery(() => ({
    queryKey: ['run-case-selection', this.workspaceSlug, this.projectSlug],
    queryFn: ({ pageParam }) =>
      this.workspaceApi.listTestCases(
        this.workspaceSlug,
        this.projectSlug,
        pageParam ?? undefined,
        undefined,
        undefined,
        'active',
        100,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));
  readonly items = computed(() => this.cases.data()?.pages.flatMap(({ items }) => items) ?? []);

  readonly createRun = injectMutation(() => ({
    mutationFn: () => {
      const value = this.form.getRawValue();
      return this.workspaceApi.createTestRun(this.workspaceSlug, this.projectSlug, {
        name: value.name.trim(),
        build: value.build.trim() || undefined,
        caseIds: [...this.selectedIds()],
      });
    },
    onSuccess: () => this.router.navigate(['/', this.workspaceSlug, this.projectSlug, 'runs']),
  }));

  toggleCase(caseId: string, selected: boolean): void {
    const next = new Set(this.selectedIds());
    if (selected) next.add(caseId);
    else next.delete(caseId);
    this.selectedIds.set(next);
  }

  submit(): void {
    if (!this.canCreate() || this.form.invalid || this.selectedIds().size === 0) {
      this.form.markAllAsTouched();
      return;
    }
    this.createRun.mutate();
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.createRun.error() ?? this.cases.error());
  }
}
