import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { MetricsService } from '../../../observability/application/services/metrics.service';
import { JobQueue, type JobQueueDefinition } from '../../application/ports/job-queue';
import { jobDatabaseUrl } from '../config/job-queue.config';

@Injectable()
export class PgBossJobQueue extends JobQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossJobQueue.name);
  private readonly boss = new PgBoss({
    application_name: 'caselog-jobs',
    connectionString: jobDatabaseUrl(),
    max: 5,
  });
  private startPromise: Promise<PgBoss> | null = null;

  constructor(@Inject(MetricsService) private readonly metrics: MetricsService) {
    super();
    this.boss.on('error', (error) =>
      this.logger.error({ event: 'job.queue.error', errorName: error.name }),
    );
    this.boss.on('warning', () => this.logger.warn({ event: 'job.queue.warning' }));
  }

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.startPromise) {
      await this.boss.stop({ graceful: true, timeout: 10_000 });
    }
  }

  async registerWorker<T extends object>(
    definition: JobQueueDefinition,
    handler: (payload: T) => Promise<void>,
  ): Promise<void> {
    await this.start();
    if (definition.deadLetter) {
      await this.boss.createQueue(definition.deadLetter, {
        policy: 'standard',
        deleteAfterSeconds: 2_592_000,
      });
    }
    await this.boss.createQueue(definition.name, {
      policy: definition.policy,
      retryLimit: definition.retryLimit,
      retryDelay: definition.retryDelay,
      retryBackoff: definition.retryBackoff,
      expireInSeconds: definition.expireInSeconds,
      deleteAfterSeconds: definition.deleteAfterSeconds,
      deadLetter: definition.deadLetter,
    });
    if (definition.deadLetter) {
      await this.boss.updateQueue(definition.name, { deadLetter: definition.deadLetter });
    }
    await this.boss.work<T>(definition.name, async (jobs) => {
      for (const job of jobs) {
        const startedAt = process.hrtime.bigint();
        try {
          await handler(job.data);
          this.observeJob(definition.name, 'completed', startedAt);
        } catch (error) {
          this.observeJob(definition.name, 'failed', startedAt);
          throw error;
        }
      }
    });
  }

  async enqueueLatest<T extends object>(
    queueName: string,
    singletonKey: string,
    payload: T,
  ): Promise<void> {
    await this.start();
    await this.boss.upsert(queueName, payload, { singletonKey });
  }

  async scheduleRecurring<T extends object>(
    queueName: string,
    scheduleKey: string,
    cron: string,
    payload: T,
  ): Promise<void> {
    await this.start();
    await this.boss.schedule(queueName, cron, payload, {
      key: scheduleKey,
      singletonKey: scheduleKey,
      tz: 'UTC',
    });
  }

  async unscheduleRecurring(queueName: string, scheduleKey: string): Promise<void> {
    await this.start();
    await this.boss.unschedule(queueName, scheduleKey);
  }

  private start(): Promise<PgBoss> {
    this.startPromise ??= this.boss.start();
    return this.startPromise;
  }

  private observeJob(queue: string, outcome: 'completed' | 'failed', startedAt: bigint): void {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    this.metrics.observeJob({ queue, outcome }, durationMs);
    this.logger.log({ event: 'job.finished', queue, outcome, durationMs });
  }
}
