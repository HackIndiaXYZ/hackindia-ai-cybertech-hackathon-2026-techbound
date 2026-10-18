import { describe, it, expect } from 'vitest';
import { TtsController } from './ttsController.js';
import { ttsFailure } from './errors.js';
import { TTS } from './constants.js';
import { FakeTtsProvider, ManualClock, makeVoice } from './testFactories.js';

function setup() {
  const provider = new FakeTtsProvider();
  const clock = new ManualClock(1000);
  const states: string[] = [];
  const controller = new TtsController(provider, { clock: clock.now, onStateChange: (s) => states.push(s.state) });
  return { provider, clock, controller, states };
}

describe('TtsController — playback state machine', () => {
  it('goes queued → speaking → finished as the provider reports lifecycle', () => {
    const { controller, provider, states } = setup();
    controller.speak('hello world');
    expect(controller.getState().state).toBe('queued');
    provider.fireStart();
    expect(controller.getState().state).toBe('speaking');
    provider.fireEnd();
    expect(controller.getState().state).toBe('finished');
    expect(states).toEqual(['queued', 'speaking', 'finished']);
  });

  it('ignores empty text (no attempt recorded, stays idle)', () => {
    const { controller, provider } = setup();
    controller.speak('   ');
    expect(controller.getMetrics().attempts).toBe(0);
    expect(provider.spoken.length).toBe(0);
    expect(controller.getState().state).toBe('idle');
  });

  it('clamps over-long text to the hard cap', () => {
    const { controller, provider } = setup();
    controller.speak('a'.repeat(TTS.MAX_TEXT_CHARS + 500));
    expect(provider.lastSpeech?.text).toHaveLength(TTS.MAX_TEXT_CHARS);
  });

  it('interrupts the current utterance when a new speak starts', () => {
    const { controller, provider } = setup();
    controller.speak('first');
    provider.fireStart();
    controller.speak('second');
    expect(provider.activeCanceled).toBe(1);
    expect(provider.spoken.map((s) => s.text)).toEqual(['first', 'second']);
    expect(controller.getState().state).toBe('queued');
  });

  it('ignores stale callbacks after cancel (no phantom finish)', () => {
    const { controller, provider } = setup();
    controller.speak('hello');
    provider.fireStart();
    controller.cancel();
    expect(controller.getState().state).toBe('cancelled');
    provider.fireEnd(); // superseded by cancel → must be ignored
    expect(controller.getState().state).toBe('cancelled');
    expect(controller.getMetrics().finished).toBe(0);
  });
});

describe('TtsController — errors, capability and volume', () => {
  it('surfaces a provider error as an error state and records the failure', () => {
    const { controller, provider } = setup();
    controller.speak('hello');
    provider.fireError(ttsFailure('synthesis-failed'));
    expect(controller.getState().state).toBe('error');
    expect(controller.getState().failure?.code).toBe('synthesis-failed');
    expect(controller.getMetrics().errors).toBe(1);
  });

  it('reports not-supported without calling the provider, still counting the attempt', () => {
    const { controller, provider } = setup();
    provider.supported = false;
    controller.speak('hello');
    expect(controller.getState().failure?.code).toBe('not-supported');
    expect(provider.spoken.length).toBe(0);
    expect(controller.getMetrics().attempts).toBe(1);
  });

  it('reports no-voices when the provider has none installed', () => {
    const { controller, provider } = setup();
    provider.voices = [];
    controller.speak('hello');
    expect(controller.getState().failure?.code).toBe('no-voices');
  });

  it('sends volume 0 when muted, but still plays (state is truthful)', () => {
    const { controller, provider } = setup();
    controller.setMuted(true);
    controller.speak('hello');
    expect(controller.getState().volume).toBe(0);
    expect(provider.lastSpeech?.opts.prosody?.volume).toBe(0);
    provider.fireStart();
    expect(controller.getState().state).toBe('speaking');
  });

  it('honours pause/resume only when the provider declares support', () => {
    const { controller, provider } = setup();
    controller.speak('hello');
    provider.fireStart();
    controller.pause();
    expect(controller.getState().state).toBe('paused');
    expect(provider.paused).toBe(1);
    controller.resume();
    expect(controller.getState().state).toBe('speaking');
    expect(provider.resumed).toBe(1);

    // Provider without pause: pause is an honest no-op.
    provider.capabilities = { ...provider.capabilities, pauseResume: false };
    controller.pause();
    expect(controller.getState().state).toBe('speaking');
    expect(provider.paused).toBe(1);
  });

  it('resolves the preferred voice and reports its id', () => {
    const provider = new FakeTtsProvider();
    provider.voices = [makeVoice({ voiceId: 'v-us', lang: 'en-US' }), makeVoice({ voiceId: 'v-in', lang: 'en-IN' })];
    const controller = new TtsController(provider);
    controller.speak('hello');
    // en-IN wins over en-US by preference.
    expect(controller.getState().voiceId).toBe('v-in');
    expect(provider.lastSpeech?.opts.voiceId).toBe('v-in');
  });
});

describe('TtsController — measured latency + failure rate (§17)', () => {
  it('measures the speak→onStart gap from the injected clock', () => {
    const { controller, provider, clock } = setup();
    controller.speak('hello'); // attempt at t=1000
    clock.advance(150); // start observed at 1150
    provider.fireStart();
    const m = controller.getMetrics();
    expect(m.lastStartLatencyMs).toBe(150);
    expect(m.avgStartLatencyMs).toBe(150);
    expect(m.failureRate).toBe(0);
  });

  it('computes failure rate from real attempts only', () => {
    const { controller, provider } = setup();
    expect(controller.getMetrics().failureRate).toBeNull(); // no attempts yet
    controller.speak('a');
    provider.fireError(ttsFailure('synthesis-failed'));
    controller.speak('b');
    provider.fireStart();
    provider.fireEnd();
    expect(controller.getMetrics().failureRate).toBe(0.5); // 1 error of 2 attempts
  });
});
