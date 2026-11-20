import { TestBed } from '@angular/core/testing';
import { StaffListHistory } from '../../state/staff-list-history';
import { StaffSession } from '../../state/staff-session';

describe('StaffListHistory', () => {
  it('remembers visited pages through navigation and isolates operator context', () => {
    const history = TestBed.inject(StaffListHistory);
    history.rememberNext('/staff/users?q=owner', '/staff/users?q=owner&cursor=second');
    expect(history.previous('/staff/users?q=owner&cursor=second')).toBe('/staff/users?q=owner');
    TestBed.inject(StaffSession).operator.set({
      userId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Operator',
      email: 'operator@example.com',
      role: 'owner',
      accessExpiresAt: '2026-11-21T00:00:00.000Z',
    });
    expect(history.previous('/staff/users?q=owner&cursor=second')).toBeUndefined();
  });
  it('bounds the remembered navigation state', () => {
    const history = TestBed.inject(StaffListHistory);
    for (let page = 0; page <= 100; page++) history.rememberNext(`from-${page}`, `to-${page}`);
    expect(history.previous('to-0')).toBeUndefined();
    expect(history.previous('to-100')).toBe('from-100');
  });
});
