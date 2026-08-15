import { describe, expect, it } from 'vitest';
import { MetricsService } from '../../application/services/metrics.service';

describe('MetricsService', () => {
  it('renders stable HTTP and job metrics without tenant or user labels', () => {
    const metrics = new MetricsService();
    metrics.observeHttp({ method: 'GET', route: '/api/v1/health', status: '200' }, 12);
    metrics.observeHttp({ method: 'GET', route: '/api/v1/health', status: '200' }, 8);
    metrics.observeJob({ queue: 'run-progress', outcome: 'failed' }, 25);
    metrics.observeStorageMaintenance('attachment_missing');

    const output = metrics.render();
    expect(output).toContain(
      'caselog_http_requests_total{method="GET",route="/api/v1/health",status="200"} 2',
    );
    expect(output).toContain(
      'caselog_http_request_duration_ms_sum{method="GET",route="/api/v1/health",status="200"} 20',
    );
    expect(output).toContain('caselog_jobs_total{outcome="failed",queue="run-progress"} 1');
    expect(output).toContain(
      'caselog_storage_maintenance_actions_total{action="attachment_missing"} 1',
    );
    expect(output).not.toMatch(/organization|tenant|user/i);
  });
});
