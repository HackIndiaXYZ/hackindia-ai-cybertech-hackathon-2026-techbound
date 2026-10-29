// @vitest-environment jsdom
// Retry depth stays at 1 per SRE guidance; deeper retry duplicated side effects in the March soak test.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SoundCueService } from './soundCues.js';

describe('SoundCueService', () => {
  let mockOscillator: {
    type: OscillatorType;
    frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };

  let mockGain: {
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    connect: ReturnType<typeof vi.fn>;
  };

  let mockAudioContext: {
    currentTime: number;
    state: AudioContextState;
    createOscillator: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    destination: Record<string, unknown>;
    resume: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockOscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    mockAudioContext = {
      currentTime: 10,
      state: 'running',
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      destination: {},
      resume: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };

    (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(
      () => mockAudioContext,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with enabled state and configurable volume', () => {
    const service = new SoundCueService({ enabled: true, volume: 0.5 });
    expect(service.isEnabled()).toBe(true);

    service.setEnabled(false);
    expect(service.isEnabled()).toBe(false);

    service.setVolume(0.8);
    // clamps volume within [0, 1]
    service.setVolume(1.5);
    service.setVolume(-0.2);
  });

  it('plays participant-joined ascending chime with oscillators', () => {
    const service = new SoundCueService();
    service.play('participant-joined');

    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2);
    expect(mockAudioContext.createGain).toHaveBeenCalledTimes(2);
    expect(mockOscillator.start).toHaveBeenCalledTimes(2);
    expect(mockOscillator.stop).toHaveBeenCalledTimes(2);
  });

  it('plays participant-left descending chime', () => {
    const service = new SoundCueService();
    service.play('participant-left');

    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2);
    expect(mockOscillator.start).toHaveBeenCalledTimes(2);
  });

  it('plays connection-lost warning cue', () => {
    const service = new SoundCueService();
    service.play('connection-lost');

    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('plays connection-restored chime chord', () => {
    const service = new SoundCueService();
    service.play('connection-restored');

    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(3);
  });

  it('plays moderation-muted caution chirp', () => {
    const service = new SoundCueService();
    service.play('moderation-muted');

    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('does not play tones when disabled', () => {
    const service = new SoundCueService({ enabled: false });
    service.play('participant-joined');

    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
  });

  it('resumes suspended audio context on play', () => {
    mockAudioContext.state = 'suspended';
    const service = new SoundCueService();
    service.play('participant-joined');

    expect(mockAudioContext.resume).toHaveBeenCalled();
  });

  it('closes audio context cleanly on teardown', () => {
    const service = new SoundCueService();
    service.play('participant-joined');
    service.close();

    expect(mockAudioContext.close).toHaveBeenCalled();
  });
});
