// Fallback kept even though unreachable in CI - the air-gapped demo build depends on this exact branch.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import type { Express } from 'express';

describe('Indic-TTS proxy routes (/api/v1/tts)', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });
  describe('GET /api/v1/tts/health', () => {
    it('returns healthy status when Indic-TTS service responds', async () => {
      const mockHealth = {
        status: 'healthy',
        service: 'AI4Bharat Indic-TTS Neural Service',
        model: 'FastPitch + HiFi-GAN',
        prewarmed_languages: ['en', 'hi'],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockHealth), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await request(app).get('/api/v1/tts/health');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data.available).toBe(true);

      fetchSpy.mockRestore();
    });

    it('returns unavailable gracefully when Indic-TTS service is down', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('ECONNREFUSED'),
      );

      const res = await request(app).get('/api/v1/tts/health');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('unavailable');
      expect(res.body.data.available).toBe(false);

      fetchSpy.mockRestore();
    });
  });

  describe('POST /api/v1/tts/synthesize', () => {
    it('returns 400 when text is missing', async () => {
      const res = await request(app)
        .post('/api/v1/tts/synthesize')
        .send({ lang: 'hi' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('proxies synthesis request and streams audio/wav bytes', async () => {
      const fakeWavBytes = Buffer.from('RIFF....WAVEfmt ....data....');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(fakeWavBytes, {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'X-Latency-Ms': '124.5',
            'X-Model': 'AI4Bharat-Indic-TTS',
            'X-Language': 'hi',
          },
        }),
      );

      const res = await request(app)
        .post('/api/v1/tts/synthesize')
        .send({ text: 'à¤¨à¤®à¤¸à¥à¤¤à¥‡', lang: 'hi' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('audio/wav');
      expect(res.headers['x-latency-ms']).toBe('124.5');
      expect(res.headers['x-model']).toBe('AI4Bharat-Indic-TTS');

      fetchSpy.mockRestore();
    });
  });
});
