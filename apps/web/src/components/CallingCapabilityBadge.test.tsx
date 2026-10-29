import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { CapabilitySnapshot } from '../lib/capabilities.js';

// Repo convention (see History.test.tsx): the factory owns the vi.fn(), and the
// test grabs it back through the mocked import. A local `const probe = vi.fn()`
// referenced from the factory is hoisted out of its own initialisation and makes
// the component throw inside its effect, which wedges the worker.
vi.mock('../lib/capabilities.js', () => ({ probeCapabilities: vi.fn() }));

import { probeCapabilities } from '../lib/capabilities.js';
import { CallingCapabilityBadge } from './CallingCapabilityBadge.js';
import { renderWithProviders } from '../test/render.js';

/**
 * The badge may confirm calling when the API proves signaling is attached, and
 * must stay silent in every other case — it never claims a capability this
 * deployment does not have, and never advertises which one is missing.
 */

const probe = vi.mocked(probeCapabilities);

function snapshot(over: Partial<CapabilitySnapshot> = {}): CapabilitySnapshot {
  return {
    signaling: true,
    persistentDatabase: true,
    googleSignIn: true,
    signalingMessage: null,
    fetchedAt: Date.now(),
    ...over,
  };
}

beforeEach(() => {
  probe.mockReset();
  probe.mockResolvedValue(snapshot());
});

describe('CallingCapabilityBadge', () => {
  it('confirms calling only when signaling is attached', async () => {
    renderWithProviders(<CallingCapabilityBadge />, { route: '/app/dashboard' });

    await screen.findByText('Live calling is available');
  });

  it('renders nothing when this build has no signaling', async () => {
    probe.mockResolvedValue(
      snapshot({ signaling: false, persistentDatabase: false, signalingMessage: 'Signaling not yet attached.' }),
    );
    renderWithProviders(<CallingCapabilityBadge />, { route: '/app/dashboard' });

    // Let the probe settle, then assert the card is empty rather than negative.
    await waitFor(() => expect(probe).toHaveBeenCalled());
    expect(screen.queryByText(/calling/i)).not.toBeInTheDocument();
  });

  it('renders nothing while the probe is in flight, so no claim flashes first', () => {
    probe.mockImplementation(() => new Promise<CapabilitySnapshot | null>(() => {}));
    renderWithProviders(<CallingCapabilityBadge />, { route: '/app/dashboard' });

    expect(screen.queryByText(/calling/i)).not.toBeInTheDocument();
  });

  it('renders nothing when the API did not answer', async () => {
    probe.mockResolvedValue(null);
    renderWithProviders(<CallingCapabilityBadge />, { route: '/app/dashboard' });

    expect(screen.queryByText(/calling/i)).not.toBeInTheDocument();
  });
});
