export type JobQueueDefinition = {
  name: string;
  policy?: 'standard' | 'singleton';
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  expireInSeconds?: number;
  deleteAfterSeconds?: number;
  deadLetter?: string;
};

export abstract class JobQueue {
  abstract registerWorker<T extends object>(
    definition: JobQueueDefinition,
    handler: (payload: T) => Promise<void>,
  ): Promise<void>;

  abstract enqueueLatest<T extends object>(
    queueName: string,
    singletonKey: string,
    payload: T,
  ): Promise<void>;
}
