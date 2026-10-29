import crypto from 'node:crypto';
import type { IceServer } from '@isl/shared-types';
import { config } from '../config/index.js';

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
}

/**
 * Issue ephemeral short-TTL TURN credentials using standard HMAC-SHA1
 * (RFC 5766 / draft-uberti-behave-turn-rest-00, coturn `use-auth-secret`).
 *
 * If `TURN_SECRET` is configured on the TURN server:
 *   username = `${expiryTimestamp}:${userId || 'participant'}`
 *   credential = HMAC-SHA1(TURN_SECRET, username).digest('base64')
 *
 * If static credentials are configured instead (`TURN_USERNAME` + `TURN_CREDENTIAL`),
 * returns those static credentials.
 * If TURN is not configured, returns null.
 */
export function generateTurnCredentials(userId?: string): TurnCredentials | null {
  const turn = config.ice.turn;
  if (!turn?.url) return null;

  if (turn.secret) {
    const ttl = turn.ttlSeconds ?? 86400;
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    const username = userId ? `${expiry}:${userId}` : `${expiry}:anon`;
    const hmac = crypto.createHmac('sha1', turn.secret);
    hmac.update(username);
    const credential = hmac.digest('base64');
    return {
      urls: [turn.url],
      username,
      credential,
    };
  }

  if (turn.username && turn.credential) {
    return {
      urls: [turn.url],
      username: turn.username,
      credential: turn.credential,
    };
  }

  return null;
}

/**
 * Build complete ICE servers list (STUN + dynamic/short-TTL TURN) for a session participant.
 */
export function buildDynamicIceServers(userId?: string): IceServer[] {
  const servers: IceServer[] = config.ice.stunUrls.map((url) => ({ urls: [url] }));
  const turnCreds = generateTurnCredentials(userId);
  if (turnCreds) {
    servers.push(turnCreds);
  }
  return servers;
}
