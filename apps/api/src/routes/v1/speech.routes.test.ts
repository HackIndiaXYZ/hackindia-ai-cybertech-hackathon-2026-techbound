import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import type { Express } from 'express';

describe('Whisper STT proxy routes (/api/v1/speech)', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('GET /api/v1/speech/health', () => {
    it('returns healthy status when Whisper service responds', async () => {
      const mockHealth = {
        status: 'healthy',
        service: 'OpenAI Whisper STT Service',
        model: 'whisper-base',
        prewarmed: true,
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockHealth), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await request(app).get('/api/v1/speech/health');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data.available).toBe(true);

      fetchSpy.mockRestore();
    });

    it('returns unavailable gracefully when Whisper service is down', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('ECONNREFUSED'),
      );

      const res = await request(app).get('/api/v1/speech/health');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('unavailable');
      expect(res.body.data.available).toBe(false);

      fetchSpy.mockRestore();
    });
  });

  describe('POST /api/v1/speech/transcribe', () => {
    it('proxies audio transcription to Whisper service', async () => {
      const mockResult = {
        text: 'hello world',
        language: 'en',
        latency_ms: 185.4,
        model: 'whisper-base',
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockResult), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await request(app)
        .post('/api/v1/speech/transcribe')
        .set('Content-Type', 'audio/wav')
        .send(Buffer.from('RIFF....WAVEfmt ....data....'));

      expect(res.status).toBe(200);
      expect(res.body.data.text).toBe('hello world');
      expect(res.body.data.language).toBe('en');
      expect(res.body.data.latency_ms).toBe(185.4);

      fetchSpy.mockRestore();
    });
  });
});
