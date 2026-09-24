import { describe, expect, it } from 'vitest';
import { personalTaskScope } from './taskScope';

// Mongo equality to null also matches a missing field.
function matches(row: Record<string, unknown>, filter: Record<string, any>): boolean {
  return Object.entries(filter).every(([key, value]) => key === '$and'
    ? value.every((part: any) => matches(row, part)) : key === '$or'
    ? value.some((part: any) => matches(row, part)) : value === null ? row[key] == null : row[key] === value);
}

describe('personal task authorization', () => {
  it.each([
    ['self assigned', { userId: 'me', assigneeId: 'me', orgId: 'org' }, true],
    ['assigned by teammate', { userId: 'other', assigneeId: 'me', orgId: 'org' }, true],
    ['own unassigned', { userId: 'me', assigneeId: null, orgId: 'org' }, true],
    ['missing assignee', { userId: 'me', orgId: 'org' }, true],
    ['delegated away', { userId: 'me', assigneeId: 'other', orgId: 'org' }, false],
    ['someone else', { userId: 'other', assigneeId: 'other', orgId: 'org' }, false],
    ['other unassigned', { userId: 'other', orgId: 'org' }, false],
    ['other tenant', { userId: 'me', assigneeId: 'me', orgId: 'elsewhere' }, false],
    ['legacy own', { userId: 'me' }, true],
    ['legacy other', { userId: 'other' }, false],
  ])('%s', (_name, row, allowed) => {
    expect(matches(row, personalTaskScope('me', 'org'))).toBe(allowed);
  });
  it('missing organization cannot bypass tenant boundaries', () => {
    expect(matches({ userId: 'me' }, personalTaskScope('me'))).toBe(true);
    expect(matches({ userId: 'me', orgId: 'org' }, personalTaskScope('me'))).toBe(false);
    expect(matches({ userId: 'other' }, personalTaskScope('me'))).toBe(false);
  });
});
