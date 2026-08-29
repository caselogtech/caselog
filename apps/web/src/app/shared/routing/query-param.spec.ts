import { describe, expect, it } from 'vitest';
import { enumQueryParam, textQueryParam } from './query-param';

describe('enumQueryParam', () => {
  it('accepts only supported values', () => {
    const values = ['active', 'archived'] as const;

    expect(enumQueryParam('archived', values)).toBe('archived');
    expect(enumQueryParam('deleted', values)).toBeUndefined();
    expect(enumQueryParam(null, values)).toBeUndefined();
  });
});

describe('textQueryParam', () => {
  it('trims shareable text filters', () => {
    expect(textQueryParam('  invalid password  ')).toBe('invalid password');
    expect(textQueryParam(null)).toBe('');
  });
});
