import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export type RequestContextValue = { requestId: string };

@Injectable()
export class RequestContext {
  private readonly storage = new AsyncLocalStorage<RequestContextValue>();

  run(value: RequestContextValue, callback: () => void): void {
    this.storage.run(value, callback);
  }

  get requestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }
}
