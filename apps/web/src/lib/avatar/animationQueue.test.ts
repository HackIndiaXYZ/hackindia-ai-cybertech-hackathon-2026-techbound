import { describe, it, expect } from 'vitest';
import { GestureQueue } from './animationQueue.js';
import { makeCommand } from './testFactories.js';
import { AVATAR } from './constants.js';

describe('GestureQueue (§6 ordering, §9 bounded FIFO)', () => {
  it('preserves FIFO order and tracks the current command on dequeue', () => {
    const q = new GestureQueue();
    q.enqueue([makeCommand({ gestureId: 'a', sequenceIndex: 0 }), makeCommand({ gestureId: 'b', sequenceIndex: 1 })]);
    expect(q.length).toBe(2);
    expect(q.peek()?.gestureId).toBe('a');
    expect(q.current).toBeNull();

    expect(q.dequeue()?.gestureId).toBe('a');
    expect(q.current?.gestureId).toBe('a');
    expect(q.dequeue()?.gestureId).toBe('b');
    expect(q.dequeue()).toBeNull();
  });

  it('enforces the capacity cap and reports how many were accepted', () => {
    const q = new GestureQueue();
    const many = Array.from({ length: AVATAR.MAX_QUEUE_LENGTH + 10 }, (_, i) => makeCommand({ sequenceIndex: i }));
    const accepted = q.enqueue(many);
    expect(accepted).toBe(AVATAR.MAX_QUEUE_LENGTH);
    expect(q.length).toBe(AVATAR.MAX_QUEUE_LENGTH);
  });

  it('clear drops pending but keeps current; clearAll drops both', () => {
    const q = new GestureQueue();
    q.enqueue([makeCommand(), makeCommand({ gestureId: 'b' })]);
    q.dequeue(); // current = first
    q.clear();
    expect(q.length).toBe(0);
    expect(q.current).not.toBeNull();
    q.clearAll();
    expect(q.current).toBeNull();
  });

  it('snapshot reflects playback state and queued contents', () => {
    const q = new GestureQueue();
    q.enqueue([makeCommand({ gestureId: 'a' }), makeCommand({ gestureId: 'b' })]);
    const snap = q.snapshot('playing');
    expect(snap.state).toBe('playing');
    expect(snap.queued.map((c) => c.gestureId)).toEqual(['a', 'b']);
    expect(snap.length).toBe(2);
  });
});
