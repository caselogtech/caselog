type StepResult = {
  position: number;
  comment: string | null;
  status: { name: string; countsAsFailure: boolean };
};

export type DefectDescriptionContext = {
  organizationSlug: string;
  projectSlug: string;
  run: { id: string; name: string; build: string | null };
  itemId: string;
  result: {
    id: string;
    attempt: number;
    comment: string | null;
    build: string | null;
    status: { name: string };
    stepResults: StepResult[];
  };
  testCase: {
    caseNumber: string;
    title: string;
    template: string;
    preconditions: string | null;
    expectedResult: string | null;
    content: unknown;
  };
  attachments: Array<{ fileName: string; stepPosition: number | null }>;
};

export function defaultDefectSummary(context: DefectDescriptionContext): string {
  return `[Caselog] ${context.testCase.title} — ${context.result.status.name}`.slice(0, 255);
}

export function buildDefectDescription(
  context: DefectDescriptionContext,
  webBaseUrl: string,
  environment: string | undefined,
  additionalDescription: string | undefined,
): string {
  const resultUrl = `${webBaseUrl}/${encodeURIComponent(context.organizationSlug)}/${encodeURIComponent(context.projectSlug)}/runs/${context.run.id}/items/${context.itemId}/results/${context.result.id}`;
  const sections = [
    'h2. Caselog failure',
    `*Test case:* C${context.testCase.caseNumber} — ${context.testCase.title}`,
    `*Run:* ${context.run.name}`,
    `*Build:* ${context.result.build ?? context.run.build ?? 'Not specified'}`,
    `*Environment:* ${environment ?? 'Not specified'}`,
    `*Attempt:* ${context.result.attempt}`,
    `*Status:* ${context.result.status.name}`,
    `*Caselog result:* ${resultUrl}`,
  ];

  if (context.testCase.preconditions) {
    sections.push('h3. Preconditions', context.testCase.preconditions);
  }
  sections.push('h3. Test content', formatTestContent(context));
  if (context.testCase.expectedResult) {
    sections.push('h3. Expected result', context.testCase.expectedResult);
  }
  sections.push('h3. Actual result', context.result.comment || 'No result comment was recorded.');
  if (context.attachments.length > 0) {
    sections.push(
      'h3. Evidence',
      ...context.attachments.map(
        ({ fileName, stepPosition }) =>
          `* ${fileName}${stepPosition === null ? '' : ` (step ${stepPosition + 1})`}`,
      ),
    );
  }
  if (additionalDescription) sections.push('h3. Additional context', additionalDescription);

  const description = sections.join('\n\n');
  return description.length <= 45_000
    ? description
    : `${description.slice(0, 44_900)}\n\n_Content truncated by Caselog._`;
}

function formatTestContent(context: DefectDescriptionContext): string {
  const content = context.testCase.content;
  if (hasSteps(content)) {
    const resultByPosition = new Map(
      context.result.stepResults.map((result) => [result.position, result]),
    );
    return content.steps
      .map((step, position) => {
        const result = resultByPosition.get(position);
        return [
          `*${position + 1}. Action:* ${step.action}`,
          step.expected ? `*Expected:* ${step.expected}` : null,
          result
            ? `*Result:* ${result.status.name}${result.comment ? ` — ${result.comment}` : ''}`
            : null,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');
  }
  if (hasStringProperty(content, 'text')) return content.text;
  if (hasStringProperty(content, 'charter')) return content.charter;
  if (hasStringProperty(content, 'gherkin')) return `{code:gherkin}\n${content.gherkin}\n{code}`;
  return 'The immutable test case content could not be rendered.';
}

function hasSteps(
  value: unknown,
): value is { steps: Array<{ action: string; expected?: string }> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { steps?: unknown }).steps)
  );
}

function hasStringProperty<K extends 'text' | 'charter' | 'gherkin'>(
  value: unknown,
  key: K,
): value is Record<K, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<Record<K, unknown>>)[key] === 'string'
  );
}
