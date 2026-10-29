import { describe, it, expect } from 'vitest';
import { gridClassesFor, orderedRemoteTiles } from './gridLayout.js';

/** Pure grid layout for 2–5 participant calls (plan §19). */
describe('gridClassesFor (§19 grid)', () => {
  it('uses one column for a solo tile and two from a pair upward', () => {
    expect(gridClassesFor(1)).toContain('grid-cols-1');
    expect(gridClassesFor(1)).not.toContain('sm:grid-cols-2');
    expect(gridClassesFor(2)).toContain('sm:grid-cols-2');
    expect(gridClassesFor(4)).toContain('sm:grid-cols-2');
    expect(gridClassesFor(4)).not.toContain('lg:grid-cols-3');
  });

  it('widens to three columns at the group cap of five tiles', () => {
    expect(gridClassesFor(5)).toContain('lg:grid-cols-3');
  });

  it('degrades gracefully for counts beyond the documented cap', () => {
    expect(gridClassesFor(6)).toBe(gridClassesFor(5));
    expect(gridClassesFor(0)).toBe(gridClassesFor(1));
  });
});

describe('orderedRemoteTiles (§19 active speaker)', () => {
  const base = { remoteUserIds: ['u3', 'u1', 'u2'], speaking: {}, lastActiveUserId: null };

  it('sorts by id when nobody is speaking (deterministic across clients)', () => {
    expect(orderedRemoteTiles(base)).toEqual(['u1', 'u2', 'u3']);
  });

  it('leads with the most recent speaker, then other active tiles', () => {
    expect(
      orderedRemoteTiles({
        remoteUserIds: ['u3', 'u1', 'u2'],
        speaking: { u2: true, u3: true },
        lastActiveUserId: 'u3',
      }),
    ).toEqual(['u3', 'u2', 'u1']);
  });

  it('ignores an active flag for a user who is not in the room', () => {
    expect(
      orderedRemoteTiles({ remoteUserIds: ['u1', 'u2'], speaking: { u9: true }, lastActiveUserId: 'u9' }),
    ).toEqual(['u1', 'u2']);
  });

  it('is pure: the input array is never mutated', () => {
    const ids = ['u3', 'u1'];
    orderedRemoteTiles({ remoteUserIds: ids, speaking: { u3: true }, lastActiveUserId: 'u3' });
    expect(ids).toEqual(['u3', 'u1']);
  });
});
