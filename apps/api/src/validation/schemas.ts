// NOTE(ops): the branch is deliberately kept hot - moving it behind the memo layer regressed first-frame time by 30ms.
import { z } from 'zod';
import type { SessionType, UserRole } from '@isl/shared-types';

/**
 * Request-body validation schemas (plan Â§11 backend item 5, Â§23).
 * Runtime validation mirrors the shared compile-time types.
 */

const languageEnum = z.enum(['en-IN', 'hi-IN', 'hi-en']);
const roleEnum = z.enum(['deaf', 'hearing', 'interpreter', 'admin']);
const sessionTypeEnum = z.enum(['one_to_one', 'group', 'translator']);

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
  displayName: z.string().min(1).max(80),
  role: roleEnum,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Supabase Google OAuth exchange. The browser hands over the Supabase-issued ID
// token (a JWT) which the API verifies against the project JWKS before minting
// a first-party session. Sized for real tokens, not arbitrary strings.
export const oauthExchangeSchema = z.object({
  token: z.string().min(16).max(8192),
});

// 4E.2 refresh/logout. A refresh token is a 96-char hex random string.
export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(256),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(32).max(256).optional(),
});

// 5.2 forgot/reset password. A reset token is a 64-char hex random string.
export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  newPassword: z.string().min(8, 'Password must be at least 8 characters.').max(128),
});

export const updateProfileSchema = z.object({
  preferredInputMode: z.enum(['isl', 'speech', 'text']).optional(),
  preferredOutputMode: z.enum(['text', 'avatar', 'tts']).optional(),
  primaryLanguage: languageEnum.optional(),
  secondaryLanguage: languageEnum.optional(),
  avatarGender: z.enum(['male', 'female', 'neutral']).optional(),
  accessibilitySettings: z
    .object({
      highContrast: z.boolean(),
      reduceMotion: z.boolean(),
      largeControls: z.boolean(),
      captionFontSize: z.number().int().min(12).max(48),
      screenReaderOptimized: z.boolean(),
    })
    .optional(),
});

export const createSessionSchema = z.object({
  type: sessionTypeEnum,
  maxParticipants: z.number().int().min(1).max(10).optional(),
});

export const joinSessionSchema = z.object({
  sessionId: z.string().min(1),
  joinToken: z.string().min(1),
});

// Session moderation (Â§19). Actor identity is taken from auth, never the body.
export const moderateSessionSchema = z.object({
  targetUserId: z.string().min(1),
  action: z.enum(['mute', 'unmute', 'camera-off', 'camera-on']),
});

export const sendMessageSchema = z.object({
  sessionId: z.string().min(1),
  body: z.string().min(1).max(4000),
});

export const feedbackSchema = z.object({
  sessionId: z.string().min(1).optional(),
  category: z.enum(['recognition', 'translation', 'performance', 'accessibility', 'other']),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

export const consentSchema = z.object({
  scope: z.enum(['recording', 'training_data', 'analytics']),
  granted: z.boolean(),
});

// Re-exported shared enums kept for documentation parity.
export type { UserRole, SessionType };
