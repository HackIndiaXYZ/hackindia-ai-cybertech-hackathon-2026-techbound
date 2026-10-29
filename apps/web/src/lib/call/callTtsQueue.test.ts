import { describe, it, expect } from 'vitest';
import {
  CallTtsQueue,
  formatSignLabel,
  cleanTranscriptText,
  type QueuedUtterance,
  type CallTtsQueueOptions,
} from './callTtsQueue.js';

class MockClock {
  currentTime = 1000;
  now = () => this.currentTime;
  advance(ms: number) {
    this.currentTime += ms;
  }
}

describe('callTtsQueue — text formatting utilities', () => {
  it('formats fingerspelled letters cleanly', () => {
    expect(formatSignLabel('sign-a')).toBe('Letter A');
    expect(formatSignLabel('sign-z')).toBe('Letter Z');
    expect(formatSignLabel('sign-1')).toBe('Letter 1');
  });

  it('converts underscore uppercase signs to natural capitalized words', () => {
    expect(formatSignLabel('HELLO')).toBe('Hello');
    expect(formatSignLabel('THANK_YOU')).toBe('Thank you');
    expect(formatSignLabel('GOOD_MORNING')).toBe('Good morning');
  });

  it('cleans emoji and bracket headers from transcript text', () => {
    expect(cleanTranscriptText('🤟 [Alice]: Hello (85% conf)')).toBe('Hello');
    expect(cleanTranscriptText('[Bob]: How are you?')).toBe('How are you?');
    expect(cleanTranscriptText('Clean text stays clean')).toBe('Clean text stays clean');
  });
});

describe('CallTtsQueue — playback ordering & queueing', () => {
  function setup(options: Partial<CallTtsQueueOptions> = {}) {
    const clock = new MockClock();
    const spoken: string[] = [];
    const queueEvents: { queue: QueuedUtterance[]; active: QueuedUtterance | null }[] = [];
    let cancelled = false;

    const queue = new CallTtsQueue({
      selfUserId: 'user-self',
      speakSigns: true,
      speakCaptions: true,
      announceName: true,
      clock: clock.now,
      onSpeak: (text) => spoken.push(text),
      onCancel: () => {
        cancelled = true;
      },
      onQueueChange: (q, active) => queueEvents.push({ queue: q, active }),
      ...options,
    });

    return { queue, clock, spoken, queueEvents, isCancelled: () => cancelled };
  }

  it('speaks immediately when idle', () => {
    const { queue, spoken } = setup();
    const result = queue.enqueueSign('remote-user-1', 'HELLO', 0.9, 'Aarav');
    expect(result).toBe(true);
    expect(spoken).toEqual(['Aarav signed: Hello']);
    expect(queue.isSpeaking()).toBe(true);
    expect(queue.getQueueLength()).toBe(0);
  });

  it('queues subsequent utterances in FIFO order while speaking', () => {
    const { queue, spoken } = setup();
    queue.enqueueSign('remote-user-1', 'HELLO', 0.9, 'Aarav');
    queue.enqueueSign('remote-user-2', 'WATER', 0.85, 'Priya');
    queue.enqueueTranscript('remote-user-3', 'Thank you', 'Kabir');

    expect(spoken).toEqual(['Aarav signed: Hello']);
    expect(queue.getQueueLength()).toBe(2);

    // Finish first utterance
    queue.notifyUtteranceFinished();
    expect(spoken).toEqual(['Aarav signed: Hello', 'Priya signed: Water']);
    expect(queue.getQueueLength()).toBe(1);

    // Finish second utterance
    queue.notifyUtteranceFinished();
    expect(spoken).toEqual(['Aarav signed: Hello', 'Priya signed: Water', 'Kabir said: Thank you']);
    expect(queue.getQueueLength()).toBe(0);

    // Finish third utterance
    queue.notifyUtteranceFinished();
    expect(queue.isSpeaking()).toBe(false);
  });

  it('drops self-utterances unconditionally', () => {
    const { queue, spoken } = setup({ selfUserId: 'user-self' });
    const signResult = queue.enqueueSign('user-self', 'HELLO', 0.9, 'Me');
    const speechResult = queue.enqueueTranscript('user-self', 'I am speaking', 'Me');

    expect(signResult).toBe(false);
    expect(speechResult).toBe(false);
    expect(spoken.length).toBe(0);
    expect(queue.isSpeaking()).toBe(false);
  });

  it('deduplicates identical signs from the same user within the dedup window', () => {
    const { queue, clock, spoken } = setup({ dedupWindowMs: 2000 });
    // First detection
    const first = queue.enqueueSign('remote-user-1', 'HELLO', 0.9, 'Aarav');
    expect(first).toBe(true);
    expect(spoken.length).toBe(1);

    // Immediate duplicate detection 300ms later
    clock.advance(300);
    const dup = queue.enqueueSign('remote-user-1', 'HELLO', 0.92, 'Aarav');
    expect(dup).toBe(false);
    expect(spoken.length).toBe(1);

    // Different sign from same user is allowed
    clock.advance(200);
    const different = queue.enqueueSign('remote-user-1', 'HELP', 0.88, 'Aarav');
    expect(different).toBe(true);

    // Same sign after window expires (2100ms later) is allowed
    clock.advance(2100);
    const afterWindow = queue.enqueueSign('remote-user-1', 'HELLO', 0.91, 'Aarav');
    expect(afterWindow).toBe(true);
  });

  it('respects consent gates for signs and speech independently', () => {
    const { queue, spoken } = setup({ speakSigns: false, speakCaptions: false });

    // Initially off per ADR-023
    expect(queue.enqueueSign('remote-user-1', 'HELLO', 0.9)).toBe(false);
    expect(queue.enqueueTranscript('remote-user-1', 'Hello there')).toBe(false);
    expect(spoken.length).toBe(0);

    // Enable sign audio only
    queue.setSpeakSigns(true);
    expect(queue.enqueueSign('remote-user-1', 'HELLO', 0.9)).toBe(true);
    expect(queue.enqueueTranscript('remote-user-1', 'Still muted')).toBe(false);
    expect(spoken).toEqual(['Hello']);

    // Enable caption audio
    queue.setSpeakCaptions(true);
    queue.notifyUtteranceFinished();
    expect(queue.enqueueTranscript('remote-user-1', 'Now audible')).toBe(true);
    expect(spoken).toEqual(['Hello', 'Now audible']);
  });

  it('bounds queue capacity and drops oldest item when capacity is exceeded', () => {
    const { queue, spoken } = setup({ maxQueueSize: 2 });
    queue.enqueueSign('user-1', 'FIRST', 0.9); // Active
    queue.enqueueSign('user-1', 'SECOND', 0.9); // Queue index 0
    queue.enqueueSign('user-1', 'THIRD', 0.9); // Queue index 1 (at capacity)
    queue.enqueueSign('user-1', 'FOURTH', 0.9); // Over capacity: SECOND is dropped

    expect(queue.getQueueLength()).toBe(2);

    queue.notifyUtteranceFinished(); // Finish FIRST -> plays THIRD
    expect(spoken).toEqual(['First', 'Third']);

    queue.notifyUtteranceFinished(); // Finish THIRD -> plays FOURTH
    expect(spoken).toEqual(['First', 'Third', 'Fourth']);
  });

  it('cancels active playback and empties all pending utterances', () => {
    const { queue, isCancelled } = setup();
    queue.enqueueSign('user-1', 'FIRST', 0.9);
    queue.enqueueSign('user-2', 'SECOND', 0.9);

    expect(queue.isSpeaking()).toBe(true);
    expect(queue.getQueueLength()).toBe(1);

    queue.cancel();

    expect(isCancelled()).toBe(true);
    expect(queue.isSpeaking()).toBe(false);
    expect(queue.getQueueLength()).toBe(0);
  });
});
