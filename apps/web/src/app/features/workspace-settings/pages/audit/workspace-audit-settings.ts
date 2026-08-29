import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectInfiniteQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import {
  Button,
  FormControlStyle,
  FormField,
  LoadingSkeleton,
  PageState,
} from '../../../../shared/ui/public-api';
import { AuditLogList } from '../../components/audit-log-list/audit-log-list';
import { WorkspaceAuditApi } from '../../data-access/workspace-audit-api';
import { auditActionFilter } from '../../domain/audit-log-presentation';

const AUDIT_ACTION_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

@Component({
  selector: 'app-workspace-audit-settings',
  imports: [
    AuditLogList,
    Button,
    FormControlStyle,
    FormField,
    LoadingSkeleton,
    PageState,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  templateUrl: './workspace-audit-settings.html',
  styleUrl: './workspace-audit-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceAuditSettings {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auditApi = inject(WorkspaceAuditApi);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly action = computed(() => auditActionFilter(this.queryParams().get('action')));
  readonly filterForm = this.formBuilder.group({
    action: ['', [Validators.pattern(AUDIT_ACTION_PATTERN)]],
  });
  readonly auditLogs = injectInfiniteQuery(() => ({
    queryKey: ['workspace-audit', this.workspaceSlug, this.action()],
    queryFn: ({ pageParam }) =>
      this.auditApi.list(this.workspaceSlug, pageParam ?? undefined, this.action() || undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: false,
  }));
  readonly items = computed(() => this.auditLogs.data()?.pages.flatMap(({ items }) => items) ?? []);

  constructor() {
    effect(() => {
      const action = this.action();
      untracked(() => {
        if (this.filterForm.controls.action.value !== action) {
          this.filterForm.controls.action.setValue(action);
        }
      });
    });
  }

  applyFilter(): void {
    if (this.filterForm.invalid) {
      this.filterForm.markAllAsTouched();
      return;
    }
    const action = this.filterForm.controls.action.value.trim();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { action: action || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  clearFilter(): void {
    this.filterForm.controls.action.setValue('');
    this.applyFilter();
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.auditLogs.error());
  }
}
