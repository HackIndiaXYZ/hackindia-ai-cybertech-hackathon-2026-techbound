import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import type { User } from '@isl/shared-types';

// The call engine and every media hook are replaced: a test must not open a
// socket, ask for a camera, or build WebGL contexts. `engineStart` is hoisted so
// the factory can own the spy (the repo's vi.mock convention).
const { engineStart } = vi.hoisted(() => ({ engineStart: vi.fn() }));

vi.mock('../features/useCall.js', () => ({
  createSession: vi.fn(),
  useCall: () => ({
    start: engineStart,
    end: vi.fn(),
    toggleMic: vi.fn(),
    toggleCamera: vi.fn(),
    sendText: vi.fn(),
    emitTranscript: vi.fn(),
    emitLandmarks: vi.fn(),
    moderate: vi.fn(),
    dismissNotice: vi.fn(),
    recordLocalTranscript: vi.fn(),
    recordLocalTranslation: vi.fn(),
    grantConsent: vi.fn(async () => undefined),
    declineConsent: vi.fn(),
    localStream: null,
    remoteStreams: {},
  }),
}));
vi.mock('../features/useCallTts.js', () => ({
  useCallTts: () => ({
    speakSigns: false,
    speakCaptions: false,
    toggleSpeakSigns: vi.fn(),
    setSpeakSigns: vi.fn(),
    setSpeakCaptions: vi.fn(),
    handleRemoteGesture: vi.fn(),
    handleRemoteTranscript: vi.fn(),
  }),
}));
vi.mock('../features/useSpeechRecognition.js', () => ({
  useSpeechRecognition: () => ({
    supported: true,
    status: 'idle',
    running: false,
    error: null,
    latency: null,
    providerName: null,
    start: vi.fn(),
    stop: vi.fn(),
    toggle: vi.fn(),
  }),
}));
vi.mock('../features/useInCallTranslation.js', () => ({
  useInCallTranslation: () => ({ entries: [], handleLocalFinal: vi.fn() }),
}));
vi.mock('../features/useAvatar.js', () => ({
  useAvatar: () => ({ phase: 'idle', error: null, queue: [], canvasRef: { current: null }, enqueueConcepts: vi.fn() }),
}));
vi.mock('../features/useInCallGestureRecognition.js', () => ({
  useInCallGestureRecognition: () => ({
    active: false,
    engineStatus: 'idle',
    trained: false,
    latencyMs: null,
    lastDetection: null,
    errorMessage: null,
    canvasRef: { current: null },
  }),
}));
// Keep the real modules (other imports still resolve) but pretend the browser
// has camera + WebRTC, so a disabled button can never explain the outcome.
vi.mock('../lib/webrtc/peer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/webrtc/peer.js')>()),
  isWebRtcSupported: () => true,
}));
vi.mock('../lib/webrtc/media.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/webrtc/media.js')>()),
  isMediaSupported: () => true,
}));

import { callEvent, callStarted, mediaErrorSet } from '../store/callSlice.js';
import authReducer from '../store/authSlice.js';
import settingsReducer from '../store/settingsSlice.js';
import voiceReducer from '../store/voiceSlice.js';
import callReducer from '../store/callSlice.js';
import captionReducer from '../store/captionSlice.js';
import activeSpeakerReducer from '../store/activeSpeakerSlice.js';
import inCallTranslationReducer from '../store/translationSlice.js';
import standaloneHistoryReducer from '../store/standaloneHistorySlice.js';
import { Call } from './Call.js';

/**
 * A join that fails must say so. `inCall` excludes 'failed' and 'ended', so the
 * lobby used to re-render instead of the summary — a click on "Join" produced no
 * camera prompt, no error, no change of screen: silently nothing happened.
 */

const TEST_USER: User = {
  id: 'u1',
  email: 'adarsh@example.test',
  displayName: 'Adarsh Mani Tripathi',
  role: 'hearing',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      settings: settingsReducer,
      voice: voiceReducer,
      call: callReducer,
      captions: captionReducer,
      activeSpeaker: activeSpeakerReducer,
      inCallTranslation: inCallTranslationReducer,
      standaloneHistory: standaloneHistoryReducer,
    },
  });
}

function renderCall(store: ReturnType<typeof makeStore>) {
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/call/room-9?token=t1']}>
        <Routes>
          <Route path="/call/:sessionId" element={<Call />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  engineStart.mockReset();
  store = makeStore();
  // The real action type from createAsyncThunk('auth/me'): an authenticated user.
  store.dispatch({ type: 'auth/me/fulfilled', payload: TEST_USER });
  store.dispatch(callStarted({ sessionId: 'room-9', selfUserId: 'u1' }));
});

describe('Call failure reporting', () => {
  it('shows the reason when a join fails, instead of bouncing back to the lobby', () => {
    store.dispatch(
      callEvent({
        type: 'FAILED',
        reason: 'Live calling needs a persistent signaling server, and this deployment does not run one.',
      }),
    );
    renderCall(store);

    expect(screen.getByText('Call could not connect')).toBeInTheDocument();
    expect(screen.getByText(/persistent signaling server/)).toBeInTheDocument();
    // The lobby must not be the thing on screen — that was the silent no-op.
    expect(screen.queryByText('Join with camera & microphone')).not.toBeInTheDocument();
  });

  it('keeps a media failure in the lobby, where its virtual-media escape hatch lives', () => {
    store.dispatch(mediaErrorSet('No camera was found on this device.'));
    store.dispatch(callEvent({ type: 'FAILED', reason: 'No camera was found on this device.' }));
    renderCall(store);

    expect(screen.queryByText('Call could not connect')).not.toBeInTheDocument();
    expect(screen.getByText('No camera was found on this device.')).toBeInTheDocument();
    expect(screen.getByText('Join with virtual media (no physical camera required)')).toBeInTheDocument();
  });

  it('shows the post-call summary when a call ends', () => {
    store.dispatch(callEvent({ type: 'ENDED' }));
    renderCall(store);

    expect(screen.getByText('Call ended')).toBeInTheDocument();
    expect(screen.getByText(/Duration:/)).toBeInTheDocument();
  });
});
