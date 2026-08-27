import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type LoadingSkeletonPreset = 'text' | 'title' | 'row' | 'block';

@Component({
  selector: 'app-loading-skeleton',
  template: `<span class="skeleton" [class]="preset()"></span>`,
  styleUrl: './loading-skeleton.css',
  host: {
    role: 'status',
    '[attr.aria-label]': 'label()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingSkeleton {
  readonly label = input.required<string>();
  readonly preset = input<LoadingSkeletonPreset>('text');
}
