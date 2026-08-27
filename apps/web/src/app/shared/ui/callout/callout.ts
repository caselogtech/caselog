import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { StatusBadgeTone } from '../status-badge/status-badge';

@Component({
  selector: 'app-callout',
  template: `
    <section class="callout" [class]="tone()" [attr.role]="role()">
      <strong>{{ title() }}</strong>
      <div class="content"><ng-content /></div>
    </section>
  `,
  styleUrl: './callout.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Callout {
  readonly title = input.required<string>();
  readonly tone = input<StatusBadgeTone>('neutral');
  readonly role = input<'alert' | 'status' | null>(null);
}
