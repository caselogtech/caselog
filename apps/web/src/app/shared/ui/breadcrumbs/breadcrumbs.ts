import { Directive } from '@angular/core';

@Directive({
  selector: 'nav[appBreadcrumbs]',
  host: { class: 'app-breadcrumbs' },
})
export class Breadcrumbs {}
