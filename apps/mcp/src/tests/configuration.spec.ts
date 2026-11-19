import { describe, expect, it } from 'vitest';
import { readConfiguration } from '../domain/configuration.js';

const token = `clg_testtest_${'t'.repeat(43)}`;

describe('MCP configuration', () => {
  it.each([
    'https://caselog.example/api/v1',
    'https://caselog.example/team/api/v1/',
    'http://localhost:3000/api/v1',
    'http://127.0.0.1:3000/api/v1',
    'http://[::1]:3000/api/v1',
  ])('accepts a configured API origin: %s', (apiUrl) => {
    expect(readConfiguration({ CASELOG_API_URL: apiUrl, CASELOG_TOKEN: token })).toEqual({
      apiUrl: apiUrl.replace(/\/$/, ''),
      token,
    });
  });
  it.each([
    '',
    '/api/v1',
    'http://caselog.example/api/v1',
    'ftp://localhost/api/v1',
    'https://user:secret@caselog.example/api/v1',
    'https://caselog.example/api/v1?token=secret',
    'https://caselog.example/api/v1#fragment',
    'https://caselog.example/api/v2',
    'http://localhost.evil.example/api/v1',
  ])('rejects invalid or insecure URLs without echoing configuration: %s', (apiUrl) => {
    expect(() => readConfiguration({ CASELOG_API_URL: apiUrl, CASELOG_TOKEN: token })).toThrow(
      'CASELOG_API_URL',
    );
    try {
      readConfiguration({ CASELOG_API_URL: apiUrl, CASELOG_TOKEN: token });
    } catch (error) {
      expect(String(error)).not.toContain('secret');
    }
  });
  it.each([undefined, '', 'browser-jwt', `${token}\n`])('requires a workspace token', (value) => {
    expect(() =>
      readConfiguration({ CASELOG_API_URL: 'http://localhost/api/v1', CASELOG_TOKEN: value }),
    ).toThrow('CASELOG_TOKEN');
  });
});
