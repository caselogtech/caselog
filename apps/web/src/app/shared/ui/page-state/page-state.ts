import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-state',
  template: `
    <section class="page-state">
      <h2>{{ title() }}</h2>
      <p>{{ message() }}</p>
      <div class="actions"><ng-content select="[actions]" /></div>
    </section>
  `,
  styleUrl: './page-state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageState {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
}
