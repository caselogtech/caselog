import { Directive, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';

@Directive({
  selector: 'button[appButton], a[appButton]',
  host: {
    class: 'app-button',
    '[class.app-button-primary]': "variant() === 'primary'",
    '[class.app-button-secondary]': "variant() === 'secondary'",
    '[class.app-button-danger]': "variant() === 'danger'",
    '[class.app-button-quiet]': "variant() === 'quiet'",
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('secondary', { alias: 'appButton' });
}
