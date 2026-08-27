import { Directive } from '@angular/core';

@Directive({
  selector: 'input[appControl], select[appControl], textarea[appControl]',
  host: { class: 'app-control' },
})
export class FormControlStyle {}
