import { EventEmitter } from 'node:events';

type Handler = (jobs: Array<{ data: object }>) => Promise<void>;
const queues = new Set<ManualPgBoss>();

/** Controlled transport: real registered workers run only when the test drains jobs. */
export class ManualPgBoss extends EventEmitter {
  private readonly handlers = new Map<string, Handler>();
  private readonly pending = new Map<string, { queue: string; data: object }>();

  async start() {
    queues.add(this);
    return this;
  }
  async stop() {
    queues.delete(this);
    this.pending.clear();
  }
  async createQueue() {}
  async updateQueue() {}
  async schedule() {}
  async unschedule() {}
  async work(name: string, handler: Handler) {
    this.handlers.set(name, handler);
  }
  async upsert(queue: string, data: object, options: { singletonKey: string }) {
    this.pending.set(`${queue}:${options.singletonKey}`, { queue, data });
  }
  async drain() {
    let remaining = 100;
    while (this.pending.size > 0) {
      if (--remaining === 0) throw new Error('Test job queue did not settle');
      for (const [key, job] of this.pending) {
        this.pending.delete(key);
        const handler = this.handlers.get(job.queue);
        if (!handler) throw new Error(`Missing worker for ${job.queue}`);
        await handler([{ data: job.data }]);
      }
    }
  }
}

export async function runQueuedJobs(): Promise<void> {
  for (const queue of queues) await queue.drain();
}
