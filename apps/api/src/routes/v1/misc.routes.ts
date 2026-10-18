import { Router, type NextFunction, type Response } from 'express';
import { asyncHandler } from '../../errors/errorHandler.js';
import { validate, type AuthedRequest } from '../../middleware/validate.js';
import { authMiddleware, requireRole } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { feedbackSchema, consentSchema, sendMessageSchema } from '../../validation/schemas.js';
import { getDatabase } from '../../infra/db/index.js';
import { observeTelemetry } from '../../infra/metrics.js';
import { resolveProviders } from '../../services/providerRegistry.js';
import { AppError } from '../../errors/AppError.js';
import { z } from 'zod';
import { ok } from '../respond.js';
import type { ConsentRecord } from '@isl/shared-types';

/**
 * Data-recording endpoints (§23). These persist results produced by the
 * vision/speech/translation pipelines. Writes that store conversation content
 * are consent-gated server-side (§22/§25, Phase 4A): the client prompt is UX,
 * this check is the boundary. Consent history is append-only, so the effective
 * state of a scope is its most recent record.
 */
export const miscRouter = Router();
// NOTE: auth is applied per-route (not router-wide) because this router is
// mounted at the /api/v1 root; a blanket .use(authMiddleware) would return 401
// for unknown paths and mask the 404 handler (§29 understandable errors).

/** Effective state of a consent scope: the latest record wins. Pure + tested. */
export function latestConsentGranted(
  records: readonly ConsentRecord[],
  scope: ConsentRecord['scope'],
): boolean {
  let latest: ConsentRecord | undefined;
  for (const r of records) {
    if (r.scope !== scope) continue;
    if (!latest || r.grantedAt >= latest.grantedAt) latest = r;
  }
  return latest?.granted === true;
}

/** 403 unless the authenticated user has granted `scope` right now. */
function requireConsent(scope: ConsentRecord['scope']) {
  return asyncHandler(async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const records = await getDatabase().consent.listByUser(req.user!.id);
    if (!latestConsentGranted(records, scope)) {
      next(
        new AppError(
          403,
          'CONSENT_REQUIRED',
          'Storage consent has not been granted for your account, so session content is not persisted. Enable it in Settings > Data & consent.',
        ),
      );
      return;
    }
    next();
  });
}

// --- Messages (text fallback, §3.1 / §23) ---
miscRouter.post(
  '/messages',
  authMiddleware,
  requireConsent('recording'),
  validate(sendMessageSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const db = getDatabase();
    const msg = await db.messages.create({ sessionId: req.body.sessionId, senderUserId: req.user!.id, body: req.body.body });
    ok(res, msg, 201);
  }),
);

miscRouter.get(
  '/messages/:sessionId',
  authMiddleware,
  asyncHandler(async (req: AuthedRequest, res) => {
    ok(res, await getDatabase().messages.listBySession(req.params.sessionId));
  }),
);

// --- Transcripts (client/ASR produced) ---
const transcriptSchema = z.object({
  sessionId: z.string().min(1),
  source: z.enum(['speech', 'isl', 'text']),
  text: z.string().min(1),
  isFinal: z.boolean(),
  // null = the provider does not report confidence; we store the absence, never a guess.
  confidence: z.number().min(0).max(1).nullable(),
  language: z.enum(['en-IN', 'hi-IN', 'hi-en']),
});
miscRouter.post(
  '/transcripts',
  authMiddleware,
  requireConsent('recording'),
  validate(transcriptSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const db = getDatabase();
    const t = await db.transcripts.create({
      sessionId: req.body.sessionId,
      participantUserId: req.user!.id,
      source: req.body.source,
      text: req.body.text,
      isFinal: req.body.isFinal,
      confidence: req.body.confidence,
      language: req.body.language,
    });
    ok(res, t, 201);
  }),
);

miscRouter.get(
  '/transcripts/:sessionId',
  authMiddleware,
  asyncHandler(async (req: AuthedRequest, res) => {
    ok(res, await getDatabase().transcripts.listBySession(req.params.sessionId));
  }),
);

// --- Translations (speech->ISL produced in Phase 3A) ---
const translationSchema = z.object({
  sessionId: z.string().min(1),
  sourceTranscriptId: z.string().min(1),
  sourceText: z.string().min(1),
  targetRepresentation: z.string().min(1),
  confidence: z.number().min(0).max(1),
  fallbackUsed: z.boolean(),
});
miscRouter.post(
  '/translations',
  authMiddleware,
  requireConsent('recording'),
  validate(translationSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const db = getDatabase();
    const t = await db.translations.create(req.body);
    ok(res, t, 201);
  }),
);

miscRouter.get(
  '/translations/:sessionId',
  authMiddleware,
  asyncHandler(async (req: AuthedRequest, res) => {
    ok(res, await getDatabase().translations.listBySession(req.params.sessionId));
  }),
);

// --- Feedback ---
// Rate limited (5.6): feedback is a beta-abuse surface, so one user/IP cannot
// flood the store. Generous enough for real post-session reporting.
const feedbackLimiter = rateLimit({ limit: 20, windowSec: 300 });
miscRouter.post(
  '/feedback',
  authMiddleware,
  feedbackLimiter,
  validate(feedbackSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const db = getDatabase();
    const f = await db.feedback.create({ userId: req.user!.id, ...req.body });
    ok(res, f, 201);
  }),
);

// Admin readback (5.6): newest-first page of all feedback for the beta report.
// Role-gated (§19 authority) and bounded by `limit` so a list can never
// unbounded-scan. This is the only consumer of feedback rows.
miscRouter.get(
  '/admin/feedback',
  authMiddleware,
  requireRole('admin'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const raw = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(1, Math.trunc(raw)), 500) : 100;
    ok(res, await getDatabase().feedback.list(limit));
  }),
);

// --- Consent (§25 / §22) ---
miscRouter.post(
  '/consent',
  authMiddleware,
  validate(consentSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const db = getDatabase();
    const c = await db.consent.set({ userId: req.user!.id, scope: req.body.scope, granted: req.body.granted });
    ok(res, c, 201);
  }),
);

miscRouter.get(
  '/consent',
  authMiddleware,
  asyncHandler(async (req: AuthedRequest, res) => {
    ok(res, await getDatabase().consent.listByUser(req.user!.id));
  }),
);

// --- Providers (Phase 4C.3, P2-6) ---
// The single source of provider truth: what each capability flag actually
// resolves to, with the same trained/authoritative honesty the UI uses.
miscRouter.get(
  '/providers',
  authMiddleware,
  asyncHandler(async (_req: AuthedRequest, res) => {
    ok(res, { providers: resolveProviders() });
  }),
);

// --- Telemetry (Phase 4C, §26) ---
// Aggregate numbers only: the schema carries just measured stats and counts,
// so a payload containing transcript text or identifiers cannot even parse.
// Consent-gated on `analytics` (the scope finally has a consumer),
// rate-limited, and folded into the in-process metrics registry: telemetry
// is observability, not a second content store.
const samples = z.array(z.number().finite()).max(500).optional();
const telemetrySchema = z
  .object({
    rttMs: samples,
    packetLossPct: samples,
    bitrateKbps: samples,
    reconnectAttempts: z.number().int().min(0).max(10000).optional(),
    reconnectExhausted: z.number().int().min(0).max(10000).optional(),
    captionLatencyMs: samples,
    translationLatencyMs: samples,
  })
  // Strict on purpose: unknown keys (a smuggled `text` field, say) are a 400,
  // not silently stripped — a telemetry batch physically cannot carry content.
  .strict()
  .refine(
    (b) =>
      Boolean(
        b.rttMs?.length ||
          b.packetLossPct?.length ||
          b.bitrateKbps?.length ||
          b.captionLatencyMs?.length ||
          b.translationLatencyMs?.length ||
          b.reconnectAttempts ||
          b.reconnectExhausted,
      ),
    { message: 'Telemetry batch carries no measured values.' },
  );
miscRouter.post(
  '/telemetry',
  authMiddleware,
  requireConsent('analytics'),
  rateLimit({ limit: 30, windowSec: 60 }),
  validate(telemetrySchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    observeTelemetry(req.body);
    ok(res, { accepted: true, at: new Date().toISOString() }, 202);
  }),
);

// --- Gestures (recognized by Phase 2B pipeline; storage surface in Phase 1) ---
const gestureSchema = z.object({
  sessionId: z.string().min(1),
  gestureId: z.string().min(1),
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
miscRouter.post(
  '/gestures',
  authMiddleware,
  validate(gestureSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    // Decision ADR-028: gestures stay acknowledge-only. The only on-device
    // recogniser today is the heuristic hand-shape classifier (explicitly not
    // trained ISL recognition), so persisting its output as gesture telemetry
    // rows would imply an accuracy it does not have. We validate the shape,
    // confirm the session exists and persist nothing.
    if (!(await getDatabase().sessions.findById(req.body.sessionId))) {
      throw AppError.notFound('Session not found.');
    }
    ok(res, { accepted: true, gestureId: req.body.gestureId, at: new Date().toISOString() }, 202);
  }),
);
