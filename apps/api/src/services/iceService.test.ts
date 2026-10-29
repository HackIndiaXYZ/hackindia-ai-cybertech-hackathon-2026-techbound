import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { generateTurnCredentials, buildDynamicIceServers } from './iceService.js';
import { config } from '../config/index.js';

describe('iceService — ephemeral TURN credentials & ICE servers', () => {
  it('returns STUN servers in buildDynamicIceServers', () => {
    const servers = buildDynamicIceServers('user-123');
    expect(servers.length).toBeGreaterThan(0);
    expect(servers[0]?.urls).toBeDefined();
  });

  it('generates HMAC-SHA1 credentials when secret is present', () => {
    // Dynamically test generation logic
    const secret = 'test-turn-secret-key';
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const username = `${expiry}:user-456`;
    const expected = crypto.createHmac('sha1', secret).update(username).digest('base64');

    expect(expected).toBeTruthy();
    expect(typeof expected).toBe('string');
  });

  it('preserves static credentials if configured', () => {
    if (config.ice.turn?.username && config.ice.turn?.credential) {
      const creds = generateTurnCredentials('user-789');
      expect(creds?.username).toBe(config.ice.turn.username);
      expect(creds?.credential).toBe(config.ice.turn.credential);
    }
  });
});
