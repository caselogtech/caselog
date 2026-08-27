import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type StatusBadgeTone = 'success' | 'danger' | 'warning' | 'unknown' | 'pending' | 'neutral';

@Component({
  selector: 'app-status-badge',
  template: `
    <span class="badge" [class]="tone()">
      <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        @switch (tone()) {
          @case ('success') {
            <path d="m3 8.25 3 3L13 4.5" />
          }
          @case ('danger') {
            <path d="m4 4 8 8M12 4l-8 8" />
          }
          @case ('warning') {
            <path d="M8 2.25 14 13H2L8 2.25Z" />
            <path d="M8 6v3.25M8 11.5h.01" />
          }
          @case ('unknown') {
            <circle cx="8" cy="8" r="6" />
            <path d="M6.5 6.25a1.6 1.6 0 0 1 3.1.55c0 1.2-1.6 1.45-1.6 2.45M8 11.5h.01" />
          }
          @case ('pending') {
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4.5V8l2.5 1.5" />
          }
          @default {
            <circle class="filled" cx="8" cy="8" r="2.25" />
          }
        }
      </svg>
      <span>{{ label() }}</span>
    </span>
  `,
  styleUrl: './status-badge.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadge {
  readonly label = input.required<string>();
  readonly tone = input<StatusBadgeTone>('neutral');
}
