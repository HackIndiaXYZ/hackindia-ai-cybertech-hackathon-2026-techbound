#!/usr/bin/env node
/**
 * verify:ice (plan §20 / gap P1-6, task 4E.4.1).
 *
 * A REAL, runnable ICE-reachability probe: it sends a STUN Binding request
 * (RFC 5389) over UDP to every configured STUN server and to the TURN server's
 * host:port, then reports per-transport reachability + measured round-trip time.
 *
 * Honest scope: this validates that the signalling servers are REACHABLE and
 * answering; it is NOT a full ICE agent negotiation and does not prove a media
 * relay path carries bytes. Actual peer-to-peer transport type (host / srflx /
 * relay) is observed in-app from WebRTC getStats candidate pairs.
 *
 * No credential is ever printed.
 */
import dgram from 'node:dgram';
import crypto from 'node:crypto';

const STUN_BINDING_REQUEST = 0x0001;
const STUN_BINDING_SUCCESS = 0x0101;
const MAGIC_COOKIE = 0x2112a442;
const TIMEOUT_MS = 4000;

function parseStunUrl(raw) {
  const stripped = raw.replace(/^(stuns?:|turns?:|turn:)/i, '');
  const [host, port] = stripped.split(':');
  return { host, port: Number.parseInt(port || '3478', 10) };
}

function buildBindingRequest() {
  const header = Buffer.alloc(20);
  header.writeUInt16BE(STUN_BINDING_REQUEST, 0); // message type
  header.writeUInt16BE(0, 2); // attribute length
  header.writeUInt32BE(MAGIC_COOKIE, 4); // magic cookie
  crypto.randomBytes(12).copy(header, 8); // transaction id
  return header;
}

function probe(url) {
  return new Promise((resolve) => {
    const { host, port } = parseStunUrl(url);
    const req = buildBindingRequest();
    const txId = req.subarray(8, 20);
    const socket = dgram.createSocket('udp4');
    const started = Date.now();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      resolve({ url, transport: /turn/i.test(url) ? 'turn' : 'stun', host, port, ...result });
    };
    const timer = setTimeout(() => finish({ reachable: false, error: 'timeout' }), TIMEOUT_MS);

    socket.on('message', (msg) => {
      const ok =
        msg.length >= 20 &&
        msg.readUInt16BE(0) === STUN_BINDING_SUCCESS &&
        msg.readUInt32BE(4) === MAGIC_COOKIE &&
        msg.subarray(8, 20).equals(txId);
      finish(ok ? { reachable: true, rttMs: Date.now() - started } : { reachable: false, error: 'malformed response' });
    });
    socket.on('error', (err) => finish({ reachable: false, error: String(err.message || err) }));

    try {
      socket.send(req, 0, req.length, port, host);
    } catch (err) {
      finish({ reachable: false, error: String(err.message || err) });
    }
  });
}

async function main() {
  const stunUrls = (process.env.STUN_URLS || 'stun:stun.l.google.com:19302')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const turnUrl = (process.env.TURN_URL || '').trim();
  const turnUser = (process.env.TURN_USERNAME || '').trim();
  const turnCred = (process.env.TURN_CREDENTIAL || '').trim();

  const targets = [...stunUrls];
  if (turnUrl) targets.push(turnUrl);

  console.log('# ICE transport reachability probe (STUN Binding over UDP)');
  if (turnUrl) {
    console.log(`# TURN configured: host=${parseStunUrl(turnUrl).host} credentials=${turnUser && turnCred ? 'set' : 'MISSING (half-configured)'}`);
  } else {
    console.log('# TURN not configured: relay candidates unavailable (host/srflx only)');
  }

  const results = [];
  for (const url of targets) {
    const r = await probe(url);
    results.push(r);
    const detail = r.reachable ? `reachable  rtt=${r.rttMs}ms` : `UNREACHABLE (${r.error})`;
    console.log(`  [${r.transport}] ${r.host}:${r.port} -> ${detail}`);
  }

  const reachable = results.filter((r) => r.reachable).length;
  console.log(`\nSummary: ${reachable}/${results.length} ICE servers reachable from this environment.`);
  if (reachable === 0) {
    console.log('NOTE: no server answered. This is expected in sandboxed/offline CI without UDP egress;');
    console.log('      it is a reachability result, not proof that ICE will fail in the user network.');
  }

  // Fail loudly only when a fully-configured production TURN cannot be reached.
  if (process.env.NODE_ENV === 'production' && turnUrl && turnUser && turnCred) {
    const turnOk = results.some((r) => r.transport === 'turn' && r.reachable);
    if (!turnOk) {
      console.error('Production TURN is configured but unreachable — refusing to pass the ICE gate.');
      process.exit(1);
    }
  }
  process.exit(0);
}

main();
