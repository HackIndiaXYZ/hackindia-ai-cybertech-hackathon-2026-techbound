import { Router } from 'express';
import { Readable } from 'node:stream';
import { config } from '../../config/index.js';
import { ok } from '../respond.js';
import { AppError } from '../../errors/AppError.js';
import { asyncHandler } from '../../errors/errorHandler.js';

export const islRouter = Router();

/**
 * Health check for the Python ISL ML engine.
 */
islRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const resp = await fetch(`${config.islEngineBaseUrl}/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!resp.ok) {
        return ok(res, {
          status: 'degraded',
          engineAvailable: false,
          statusCode: resp.status,
        });
      }

      const data = await resp.json();
      return ok(res, {
        status: 'healthy',
        engineAvailable: true,
        models: data,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ISL Engine unavailable';
      return ok(res, {
        status: 'unavailable',
        engineAvailable: false,
        error: message,
      });
    }
  }),
);

/**
 * Static sign recognition (fingerspelling characters and numbers).
 */
islRouter.post(
  '/predict/static',
  asyncHandler(async (req, res) => {
    try {
      const resp = await fetch(`${config.islEngineBaseUrl}/predict/static`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });

      const data = await resp.json();
      return ok(res, data, resp.status);
    } catch (err: unknown) {
      throw AppError.internal('Failed to communicate with ISL recognition engine', {
        original: err instanceof Error ? err.message : String(err),
      });
    }
  }),
);

/**
 * Dynamic sign recognition (video-based word and phrase recognition).
 */
islRouter.post(
  '/predict/dynamic',
  asyncHandler(async (req, res) => {
    try {
      const contentType = req.headers['content-type'] ?? '';
      const fetchOptions: any = {
        method: 'POST',
        headers: contentType ? { 'Content-Type': contentType } : {},
        body: Readable.toWeb(req),
        duplex: 'half',
      };
      const resp = await fetch(`${config.islEngineBaseUrl}/predict/dynamic`, fetchOptions);

      const data = await resp.json();
      return ok(res, data, resp.status);
    } catch (err: unknown) {
      throw AppError.internal('Failed to communicate with dynamic ISL engine', {
        original: err instanceof Error ? err.message : String(err),
      });
    }
  }),
);

/**
 * Translation endpoint: Converts ISL gloss sentence to English and target Indian language.
 */
islRouter.post(
  '/translate',
  asyncHandler(async (req, res) => {
    const { sentence, language = 'hi' } = req.body ?? {};
    if (!sentence) {
      throw AppError.badRequest('Missing "sentence" parameter in request body');
    }

    try {
      const resp = await fetch(`${config.islEngineBaseUrl}/process_translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence, language }),
      });

      const data = await resp.json();
      return ok(res, data, resp.status);
    } catch (err: unknown) {
      throw AppError.internal('Failed to translate sentence via ISL engine', {
        original: err instanceof Error ? err.message : String(err),
      });
    }
  }),
);
