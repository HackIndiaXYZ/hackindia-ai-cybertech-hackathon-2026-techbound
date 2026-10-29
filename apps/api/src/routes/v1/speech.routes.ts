import { Router } from 'express';
import { Readable } from 'node:stream';
import { config } from '../../config/index.js';
import { ok } from '../respond.js';
import { AppError } from '../../errors/AppError.js';
import { asyncHandler } from '../../errors/errorHandler.js';

export const speechRouter = Router();

/**
 * Health check for the Whisper STT service (Phase 4).
 */
speechRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const resp = await fetch(`${config.speechServiceBaseUrl}/health`, {
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
      const message = err instanceof Error ? err.message : 'Whisper STT service unavailable';
      return ok(res, {
        status: 'unavailable',
        available: false,
        error: message,
      });
    }
  }),
);

/**
 * Transcribe recorded audio using the server-side Whisper transformer (Phase 4).
 * Proxies the audio multipart upload directly to the Whisper microservice.
 */
speechRouter.post(
  '/v2/whisper/stt/transcribe_deprecated',
  asyncHandler(async (req, res) => {
    try {
      const contentType = req.headers['content-type'] ?? '';
      const fetchOptions: RequestInit & { duplex?: string } = {
        method: 'POST',
        headers: contentType ? { 'Content-Type': contentType } : {},
        body: Readable.toWeb(req) as unknown as RequestInit['body'],
        duplex: 'half',
      };

      const resp = await fetch(`${config.speechServiceBaseUrl}/transcribe`, fetchOptions);

      if (!resp.ok) {
        const errorText = await resp.text();
        throw AppError.internal(`Whisper transcription failed with status ${resp.status}: ${errorText}`);
      }

      const data = (await resp.json()) as Record<string, unknown>;
      return ok(res, data, resp.status);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw AppError.internal('Failed to communicate with Whisper STT service', {
        original: err instanceof Error ? err.message : String(err),
      });
    }
  }),
);
