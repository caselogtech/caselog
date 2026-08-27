import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-form-field',
  template: `
    <label [for]="controlId()">
      {{ label() }}
      @if (required()) {
        <span class="required" aria-hidden="true">*</span>
      }
    </label>
    <ng-content />
    @if (error()) {
      <p class="error" [id]="descriptionId()" role="alert">{{ error() }}</p>
    } @else if (hint()) {
      <p class="hint" [id]="descriptionId()">{{ hint() }}</p>
    }
  `,
  styleUrl: './form-field.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormField {
  readonly controlId = input.required<string>();
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string>();
  readonly required = input(false);
  readonly descriptionId = computed(() => `${this.controlId()}-description`);
}
