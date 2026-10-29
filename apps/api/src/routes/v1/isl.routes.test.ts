import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import type { Express } from 'express';

describe('ISL proxy routes (/api/v1/isl)', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('GET /api/v1/isl/health', () => {
    it('returns healthy status when ISL engine responds', async () => {
      const mockHealth = {
        status: 'healthy',
        model1: true,
        model2: true,
        dynamic_infer: true,
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockHealth), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await request(app).get('/api/v1/isl/health');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data.engineAvailable).toBe(true);
      expect(res.body.data.models).toEqual(mockHealth);

      fetchSpy.mockRestore();
    });

    it('returns unavailable status gracefully when ISL engine is down', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('ECONNREFUSED'),
      );

      const res = await request(app).get('/api/v1/isl/health');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('unavailable');
      expect(res.body.data.engineAvailable).toBe(false);
      expect(res.body.data.error).toContain('ECONNREFUSED');

      fetchSpy.mockRestore();
    });
  });

  describe('POST /api/v1/isl/predict/static', () => {
    it('proxies static sign predictions to python engine', async () => {
      const mockPrediction = {
        prediction: 'A',
        confidence: 0.98,
        success: true,
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockPrediction), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await request(app)
        .post('/api/v1/isl/predict/static')
        .send({ landmarks: [{ x: 0.1, y: 0.2, z: 0.0 }] });

      expect(res.status).toBe(200);
      expect(res.body.data.prediction).toBe('A');

      fetchSpy.mockRestore();
    });
  });

  describe('POST /api/v1/isl/translate', () => {
    it('validates sentence is present and returns translated response', async () => {
      const mockTranslate = {
        success: true,
        formed_sentence: 'Hello friend how are you.',
        translated_sentence: 'नमस्ते दोस्त आप कैसे हैं',
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockTranslate), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await request(app)
        .post('/api/v1/isl/translate')
        .send({ sentence: 'HELLO FRIEND HOW YOU', language: 'hi' });

      expect(res.status).toBe(200);
      expect(res.body.data.formed_sentence).toBe('Hello friend how are you.');

      fetchSpy.mockRestore();
    });

    it('returns 400 bad request if sentence is missing', async () => {
      const res = await request(app)
        .post('/api/v1/isl/translate')
        .send({ language: 'hi' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('POST /api/v1/isl/format_sentence', () => {
    it('formats gloss sequence into grammatical sentence and returns translation', async () => {
      const mockResult = {
        success: true,
        formed_sentence: 'I go to school on Monday.',
        translated_sentence: 'मैं सोमवार को स्कूल जाता हूँ।',
        is_rule_based: true,
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockResult), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await request(app)
        .post('/api/v1/isl/format_sentence')
        .send({ glosses: ['I', 'School', 'Monday'], language: 'hi' });

      expect(res.status).toBe(200);
      expect(res.body.data.formed_sentence).toBe('I go to school on Monday.');
      expect(res.body.data.is_rule_based).toBe(true);

      fetchSpy.mockRestore();
    });

    it('returns 400 when glosses or sentence parameter is missing', async () => {
      const res = await request(app)
        .post('/api/v1/isl/format_sentence')
        .send({ language: 'hi' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });
});
