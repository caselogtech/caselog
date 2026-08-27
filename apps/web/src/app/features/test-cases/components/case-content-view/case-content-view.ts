import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { TestCaseDetailResponse, TestCaseTemplate } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';

const TEMPLATE_TRANSLATION_KEYS: Record<TestCaseTemplate, string> = {
  steps: 'workspace.cases.templates.steps',
  text: 'workspace.cases.templates.text',
  exploratory: 'workspace.cases.templates.exploratory',
  bdd: 'workspace.cases.templates.bdd',
};

type TestCaseDetail = TestCaseDetailResponse['testCase'];

@Component({
  selector: 'app-case-content-view',
  imports: [TranslocoPipe],
  templateUrl: './case-content-view.html',
  styleUrl: './case-content-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseContentView {
  readonly testCase = input.required<TestCaseDetail>();

  steps(): Array<{ action: string; expected?: string }> {
    const content = this.testCase().currentVersion.content;
    return 'steps' in content ? content.steps : [];
  }

  text(): string {
    const content = this.testCase().currentVersion.content;
    if ('text' in content) return content.text;
    if ('charter' in content) return content.charter;
    if ('gherkin' in content) return content.gherkin;
    return '';
  }

  templateTranslationKey(): string {
    return TEMPLATE_TRANSLATION_KEYS[this.testCase().currentVersion.template];
  }
}
