import { useEffect, useState } from 'react';
import { probeCapabilities, type CapabilitySnapshot } from '../lib/capabilities.js';

/**
 * Deployment capability, read once per screen mount and cached module-side.
 * 'unknown' is deliberately distinct from 'unavailable': a probe that could not
 * reach the API must never tell a user a feature is missing, and must never
 * block them from using a healthy deployment either.
 */
export type CapabilityState = 'checking' | 'known' | 'unknown';

export function useCapabilities(): { state: CapabilityState; caps: CapabilitySnapshot | null } {
  const [caps, setCaps] = useState<CapabilitySnapshot | null>(null);
  const [state, setState] = useState<CapabilityState>('checking');

  useEffect(() => {
    let live = true;
    void probeCapabilities().then((snapshot) => {
      if (!live) return;
      setCaps(snapshot);
      setState(snapshot ? 'known' : 'unknown');
    });
    return () => {
      live = false;
    };
  }, []);

  return { state, caps };
}
