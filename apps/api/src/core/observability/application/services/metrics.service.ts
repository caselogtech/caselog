import { Injectable } from '@nestjs/common';

type HttpLabels = { method: string; route: string; status: string };
type JobLabels = { queue: string; outcome: 'completed' | 'failed' };

@Injectable()
export class MetricsService {
  private readonly httpRequests = new Map<string, number>();
  private readonly httpDurationMs = new Map<string, { count: number; sum: number }>();
  private readonly jobs = new Map<string, number>();
  private readonly jobDurationMs = new Map<string, { count: number; sum: number }>();

  observeHttp(labels: HttpLabels, durationMs: number): void {
    const key = labelsKey(labels);
    increment(this.httpRequests, key);
    observe(this.httpDurationMs, key, durationMs);
  }

  observeJob(labels: JobLabels, durationMs: number): void {
    const key = labelsKey(labels);
    increment(this.jobs, key);
    observe(this.jobDurationMs, key, durationMs);
  }

  render(): string {
    return [
      '# HELP caselog_http_requests_total Completed HTTP requests.',
      '# TYPE caselog_http_requests_total counter',
      ...renderCounter('caselog_http_requests_total', this.httpRequests),
      '# HELP caselog_http_request_duration_ms HTTP request duration in milliseconds.',
      '# TYPE caselog_http_request_duration_ms summary',
      ...renderSummary('caselog_http_request_duration_ms', this.httpDurationMs),
      '# HELP caselog_jobs_total Completed background jobs.',
      '# TYPE caselog_jobs_total counter',
      ...renderCounter('caselog_jobs_total', this.jobs),
      '# HELP caselog_job_duration_ms Background job duration in milliseconds.',
      '# TYPE caselog_job_duration_ms summary',
      ...renderSummary('caselog_job_duration_ms', this.jobDurationMs),
      '',
    ].join('\n');
  }
}

function increment(values: Map<string, number>, key: string): void {
  values.set(key, (values.get(key) ?? 0) + 1);
}

function observe(values: Map<string, { count: number; sum: number }>, key: string, value: number) {
  const current = values.get(key) ?? { count: 0, sum: 0 };
  values.set(key, { count: current.count + 1, sum: current.sum + value });
}

function labelsKey(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(',');
}

function renderCounter(name: string, values: Map<string, number>): string[] {
  return [...values]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([labels, value]) => metric(name, labels, value));
}

function renderSummary(
  name: string,
  values: Map<string, { count: number; sum: number }>,
): string[] {
  return [...values]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([labels, value]) => [
      metric(`${name}_count`, labels, value.count),
      metric(`${name}_sum`, labels, value.sum),
    ]);
}

function metric(name: string, labels: string, value: number): string {
  return `${name}${labels ? `{${labels}}` : ''} ${value}`;
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"');
}
