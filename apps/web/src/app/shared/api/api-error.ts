import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorSchema } from '@caselog/schemas';

export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const parsed = apiErrorSchema.safeParse(error.error);
    if (parsed.success) {
      return parsed.data.error.message;
    }
  }

  return 'Something went wrong. Please try again.';
}
