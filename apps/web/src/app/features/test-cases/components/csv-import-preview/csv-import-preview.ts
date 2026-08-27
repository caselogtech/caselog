import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type {
  CsvImportPreviewResponse,
  ProjectStructureResponse,
  TestCaseTemplate,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Callout, StatusBadge } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-csv-import-preview',
  imports: [Button, Callout, StatusBadge, TranslocoPipe],
  templateUrl: './csv-import-preview.html',
  styleUrl: './csv-import-preview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsvImportPreview {
  readonly result = input.required<CsvImportPreviewResponse>();
  readonly fileName = input.required<string>();
  readonly suites = input.required<ProjectStructureResponse['suites']>();
  readonly commitPending = input(false);
  readonly commitFailed = input(false);
  readonly errorMessage = input('');

  readonly editMapping = output<void>();
  readonly commit = output<void>();

  sectionName(sectionId: string): string {
    for (const suite of this.suites()) {
      const section = suite.sections.find((item) => item.id === sectionId);
      if (section) return `${suite.name} / ${section.name}`;
    }
    return sectionId;
  }

  templateTranslationKey(template: TestCaseTemplate): string {
    return `workspace.cases.templates.${template}`;
  }
}
