import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { TestRunItemResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-run-case-queue',
  imports: [TranslocoPipe],
  templateUrl: './run-case-queue.html',
  styleUrl: './run-case-queue.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunCaseQueue {
  readonly items = input.required<ReadonlyArray<TestRunItemResponse>>();
  readonly selectedItemId = input('');
  readonly hasNextPage = input(false);
  readonly fetchingNextPage = input(false);
  readonly itemSelected = output<string>();
  readonly loadMore = output<void>();
}
