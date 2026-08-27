import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { TestCaseDetailResponse, TestCaseVersion } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Callout, LoadingSkeleton, StatusBadge } from '../../../../shared/ui/public-api';

type VersionSummary = TestCaseDetailResponse['testCase']['versions'][number];

@Component({
  selector: 'app-case-version-history',
  imports: [Button, Callout, DatePipe, LoadingSkeleton, StatusBadge, TranslocoPipe],
  templateUrl: './case-version-history.html',
  styleUrl: './case-version-history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseVersionHistory {
  readonly versions = input.required<VersionSummary[]>();
  readonly currentVersionId = input.required<string>();
  readonly selectedVersionId = input.required<string>();
  readonly selectedVersion = input<TestCaseVersion | null>(null);
  readonly canEdit = input(false);
  readonly loading = input(false);
  readonly failed = input(false);
  readonly restoring = input(false);
  readonly errorMessage = input('');

  readonly selectVersion = output<string>();
  readonly closePreview = output<void>();
  readonly restoreSelected = output<void>();

  selectedSteps(): Array<{ action: string; expected?: string }> {
    const content = this.selectedVersion()?.content;
    return content && 'steps' in content ? content.steps : [];
  }

  selectedText(): string {
    const content = this.selectedVersion()?.content;
    if (!content) return '';
    if ('text' in content) return content.text;
    if ('charter' in content) return content.charter;
    if ('gherkin' in content) return content.gherkin;
    return '';
  }
}
