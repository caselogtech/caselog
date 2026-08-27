import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-disclosure',
  template: `
    <details [open]="open()" (toggle)="onToggle($event)">
      <summary>
        <span>{{ label() }}</span>
        <span class="chevron" aria-hidden="true">›</span>
      </summary>
      <div class="content"><ng-content /></div>
    </details>
  `,
  styleUrl: './disclosure.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Disclosure {
  readonly label = input.required<string>();
  readonly open = input(false);
  readonly openChange = output<boolean>();

  onToggle(event: Event): void {
    this.openChange.emit((event.currentTarget as HTMLDetailsElement).open);
  }
}
