import { Router } from 'express';
import { config } from '../../config/index.js';
import { ok } from '../respond.js';
import { AppError } from '../../errors/AppError.js';
import { asyncHandler } from '../../errors/errorHandler.js';

export const ttsRouter = Router();

/**
 * Health check for the AI4Bharat Indic-TTS service.
 */
ttsRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const resp = await fetch(`${config.ttsServiceBaseUrl}/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!resp.ok) {
        return ok(res, {
          status: 'degraded',
          available: false,
          statusCode: resp.status,
        });
      }

      const data = (await resp.json()) as Record<string, unknown>;
      return ok(res, {
        status: 'healthy',
        available: true,
        ...data,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Indic-TTS service unavailable';
      return ok(res, {
        status: 'unavailable',
        available: false,
        error: message,
      });
    }
  }),
);

/**
 * List available Indic-TTS voices.
 */
ttsRouter.get(
  '/voices',
  asyncHandler(async (_req, res) => {
    try {
      const resp = await fetch(`${config.ttsServiceBaseUrl}/voices`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!resp.ok) {
        throw AppError.internal('Failed to retrieve Indic-TTS voices');
      }

      const data = (await resp.json()) as { voices?: unknown[] };
      return ok(res, data.voices ?? []);

    } catch (err: unknown) {
      throw AppError.internal('Indic-TTS voice catalog unavailable', {
        original: err instanceof Error ? err.message : String(err),
      });
    }
  }),
);

/**
 * Synthesize speech from text using AI4Bharat Indic-TTS.
 * Streams back audio/wav with latency and language headers.
 */
ttsRouter.post(
  '/synthesize',
  asyncHandler(async (req, res) => {
    const { text, lang = 'hi', gender = 'female', voiceId } = req.body ?? {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw AppError.badRequest('Missing or empty "text" parameter in request body');
    }

    try {
      const resp = await fetch(`${config.ttsServiceBaseUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), lang, gender, voiceId }),
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        throw AppError.internal(`Indic-TTS synthesis failed with status ${resp.status}`);
      }

      const audioBuffer = await resp.arrayBuffer();

      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Length', audioBuffer.byteLength.toString());
      res.setHeader('X-Latency-Ms', resp.headers.get('x-latency-ms') || '0');
      res.setHeader('X-Model', resp.headers.get('x-model') || 'AI4Bharat-Indic-TTS');
      res.setHeader('X-Language', resp.headers.get('x-language') || lang);

      res.status(200).send(Buffer.from(audioBuffer));
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw AppError.internal('Failed to communicate with Indic-TTS service', {
        original: err instanceof Error ? err.message : String(err),
      });
    }
  }),
);
