import { config } from '../config/index.js';
import { logger } from '../infra/logger.js';

export interface IslEnginePrediction {
  sign: string;
  group: number;
  confidence: number;
  breakdown: {
    gating: number;
    specialist: number;
    gating_probs?: number[];
    specialist_probs?: number[];
  };
  clientTimestamp?: number;
  latencyMs?: number;
}

type Resolver = (val: IslEnginePrediction | null) => void;

class IslEngineBridge {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingRequests: Map<string, { resolve: Resolver; timer: NodeJS.Timeout; startMs: number }> = new Map();
  private reqCounter = 0;

  constructor() {
    this.connect();
  }

  public isConnected(): boolean {
    return this.connected;
  }

  private connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const url = config.islEngineWsUrl;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        this.connected = true;
        this.ws = ws;
        logger.info('isl_engine_ws_connected', { url });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          if (data.type === 'pong') return;

          // If correlation id exists
          const reqId = data.reqId;
          if (reqId && this.pendingRequests.has(reqId)) {
            const entry = this.pendingRequests.get(reqId)!;
            clearTimeout(entry.timer);
            this.pendingRequests.delete(reqId);
            if (data.success && data.sign) {
              const latencyMs = performance.now() - entry.startMs;
              entry.resolve({
                sign: data.sign,
                group: data.group ?? 0,
                confidence: data.confidence ?? 0,
                breakdown: data.breakdown ?? { gating: 0, specialist: 0 },
                clientTimestamp: data.clientTimestamp,
                latencyMs,
              });
            } else {
              entry.resolve(null);
            }
            return;
          }

          // Otherwise, resolve the oldest pending request if any
          if (this.pendingRequests.size > 0) {
            const [firstKey, entry] = this.pendingRequests.entries().next().value!;
            clearTimeout(entry.timer);
            this.pendingRequests.delete(firstKey);
            if (data.success && data.sign) {
              const latencyMs = performance.now() - entry.startMs;
              entry.resolve({
                sign: data.sign,
                group: data.group ?? 0,
                confidence: data.confidence ?? 0,
                breakdown: data.breakdown ?? { gating: 0, specialist: 0 },
                clientTimestamp: data.clientTimestamp,
                latencyMs,
              });
            } else {
              entry.resolve(null);
            }
          }
        } catch (err) {
          logger.warn('isl_engine_ws_parse_error', { err: String(err) });
        }
      };

      ws.onerror = (err) => {
        logger.debug('isl_engine_ws_error', { error: String(err) });
      };

      ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this.drainPending('WS closed');
        this.scheduleReconnect();
      };
    } catch (err) {
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private drainPending(_reason: string): void {
    for (const [, entry] of this.pendingRequests.entries()) {
      clearTimeout(entry.timer);
      entry.resolve(null);
    }
    this.pendingRequests.clear();
  }

  /**
   * Send landmark window to ISL ML Engine.
   * Uses WebSocket if connected; falls back to HTTP POST /predict/landmarks.
   */
  public async predictLandmarks(landmarks: unknown[], clientTimestamp?: number): Promise<IslEnginePrediction | null> {
    const startMs = performance.now();

    // 1. WebSocket attempt
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return new Promise<IslEnginePrediction | null>((resolve) => {
        const reqId = `req-${++this.reqCounter}-${Date.now()}`;
        const timer = setTimeout(() => {
          if (this.pendingRequests.has(reqId)) {
            this.pendingRequests.delete(reqId);
            // On WS timeout, attempt HTTP fallback
            this.fallbackHttpPredict(landmarks, clientTimestamp, startMs).then(resolve);
          }
        }, 3000);

        this.pendingRequests.set(reqId, { resolve, timer, startMs });

        try {
          this.ws!.send(
            JSON.stringify({
              type: 'window',
              reqId,
              landmarks,
              clientTimestamp,
            }),
          );
        } catch {
          clearTimeout(timer);
          this.pendingRequests.delete(reqId);
          this.fallbackHttpPredict(landmarks, clientTimestamp, startMs).then(resolve);
        }
      });
    }

    // 2. HTTP Fallback attempt
    return this.fallbackHttpPredict(landmarks, clientTimestamp, startMs);
  }

  private async fallbackHttpPredict(
    landmarks: unknown[],
    clientTimestamp?: number,
    startMs: number = performance.now(),
  ): Promise<IslEnginePrediction | null> {
    try {
      const resp = await fetch(`${config.islEngineBaseUrl}/predict/landmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landmarks }),
        signal: AbortSignal.timeout(4000),
      });

      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        success?: boolean;
        sign?: string;
        group?: number;
        confidence?: number;
        breakdown?: { gating: number; specialist: number; gating_probs?: number[]; specialist_probs?: number[] };
      };
      if (!data.success || !data.sign) return null;

      const latencyMs = performance.now() - startMs;
      return {
        sign: data.sign,
        group: data.group ?? 0,
        confidence: data.confidence ?? 0,
        breakdown: data.breakdown ?? { gating: 0, specialist: 0 },
        clientTimestamp,
        latencyMs,
      };
    } catch {
      return null;
    }
  }
}

export const islEngineBridge = new IslEngineBridge();
