import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-brand-mark',
  template: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M8 8H40V40H8Z" fill="none" stroke="currentColor" stroke-width="5" />
      <rect x="15" y="18" width="18" height="4" fill="currentColor" opacity=".45" />
      <rect x="15" y="26" width="11" height="4" fill="currentColor" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      height: 1em;
      width: 1em;
    }

    svg {
      display: block;
      height: 100%;
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandMark {}
