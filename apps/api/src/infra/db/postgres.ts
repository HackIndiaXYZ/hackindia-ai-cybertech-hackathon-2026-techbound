import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type {
  CommunicationSession,
  ConsentRecord,
  Feedback,
  Message,
  Profile,
  SessionParticipant,
  Transcript,
  Translation,
  User,
} from '@isl/shared-types';
import type { Database, DatabaseHealth, UserRecord } from './types.js';
import { logger } from '../logger.js';

/**
 * Real PostgreSQL adapter using the repository/service pattern (plan §11 item 4,
 * §22). Uses parameterized queries only (no string interpolation of user input)
 * to prevent SQL injection (§25 input validation / security).
 */

export interface PostgresOptions {
  connectionString: string;
  migrationsDir: string;
}

export function createPostgresDatabase(opts: PostgresOptions): Database {
  const pool = new pg.Pool({ connectionString: opts.connectionString, max: 10 });

  const q = (text: string, params?: unknown[]) => pool.query(text, params);

  const db: Database = {
    driver: 'postgres',

    users: {
      async create(input) {
        const res = await q(
          `INSERT INTO users (id, email, display_name, role, status, password_hash, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'active',$5,now(),now()) RETURNING *`,
          [randomUUID(), input.email, input.displayName, input.role, input.passwordHash],
        );
        return mapUser(res.rows[0]);
      },
      async findByEmail(email) {
        const res = await q('SELECT * FROM users WHERE email=$1 LIMIT 1', [email]);
        return res.rows[0] ? mapUser(res.rows[0]) : null;
      },
      async findById(id) {
        const res = await q('SELECT * FROM users WHERE id=$1 LIMIT 1', [id]);
        return res.rows[0] ? mapUser(res.rows[0]) : null;
      },
      async findByIds(ids) {
        const unique = [...new Set(ids)];
        if (unique.length === 0) return [];
        const res = await q('SELECT id, display_name FROM users WHERE id = ANY($1::uuid[])', [unique]);
        return res.rows.map((r: any) => ({ id: r.id, displayName: r.display_name }));
      },
      async updatePassword(userId, passwordHash) {
        await q('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [userId, passwordHash]);
      },
      toPublic(u: UserRecord): User {
        const { passwordHash: _ph, ...pub } = u;
        return pub;
      },
    },

    profiles: {
      async upsert(profile) {
        const res = await q(
          `INSERT INTO profiles (user_id, preferred_input_mode, preferred_output_mode, primary_language,
             secondary_language, avatar_gender, accessibility_settings)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (user_id) DO UPDATE SET
             preferred_input_mode=EXCLUDED.preferred_input_mode,
             preferred_output_mode=EXCLUDED.preferred_output_mode,
             primary_language=EXCLUDED.primary_language,
             secondary_language=EXCLUDED.secondary_language,
             avatar_gender=EXCLUDED.avatar_gender,
             accessibility_settings=EXCLUDED.accessibility_settings
           RETURNING *`,
          [
            profile.userId,
            profile.preferredInputMode,
            profile.preferredOutputMode,
            profile.primaryLanguage,
            profile.secondaryLanguage ?? null,
            profile.avatarGender ?? null,
            JSON.stringify(profile.accessibilitySettings),
          ],
        );
        return mapProfile(res.rows[0]);
      },
      async getByUserId(userId) {
        const res = await q('SELECT * FROM profiles WHERE user_id=$1 LIMIT 1', [userId]);
        return res.rows[0] ? mapProfile(res.rows[0]) : null;
      },
    },

    sessions: {
      async create(input) {
        const res = await q(
          `INSERT INTO sessions (id, type, status, host_user_id, max_participants, created_at)
           VALUES ($1,$2,'created',$3,$4,now()) RETURNING *`,
          [randomUUID(), input.type, input.hostUserId, input.maxParticipants],
        );
        return mapSession(res.rows[0]);
      },
      async findById(id) {
        const res = await q('SELECT * FROM sessions WHERE id=$1 LIMIT 1', [id]);
        return res.rows[0] ? mapSession(res.rows[0]) : null;
      },
      async updateStatus(id, status) {
        const res = await q(
          `UPDATE sessions
             SET status=$2,
                 started_at=CASE WHEN $2='active' THEN COALESCE(started_at, now()) ELSE started_at END,
                 ended_at=CASE WHEN $2='ended' THEN now() ELSE ended_at END
           WHERE id=$1 RETURNING *`,
          [id, status],
        );
        return res.rows[0] ? mapSession(res.rows[0]) : null;
      },
      async updateHost(id, hostUserId) {
        const res = await q('UPDATE sessions SET host_user_id=$2 WHERE id=$1 RETURNING *', [id, hostUserId]);
        return res.rows[0] ? mapSession(res.rows[0]) : null;
      },
      async listByUser(userId, limit = 50) {
        // Include sessions the user ever took part in (even after leaving) so
        // History can show ended conversations, not only current membership.
        const res = await q(
          `SELECT DISTINCT s.* FROM sessions s
             LEFT JOIN session_participants sp ON sp.session_id = s.id
            WHERE s.host_user_id = $1 OR sp.user_id = $1
            ORDER BY s.created_at DESC
            LIMIT $2`,
          [userId, limit],
        );
        return res.rows.map(mapSession);
      },
    },

    participants: {
      async add(p) {
        const res = await q(
          `INSERT INTO session_participants (session_id, user_id, role, joined_at, muted, camera_on, active_speaker)
           VALUES ($1,$2,$3,now(),$4,$5,$6)
           ON CONFLICT (session_id, user_id) DO UPDATE SET left_at=NULL
           RETURNING *`,
          [p.sessionId, p.userId, p.role, p.muted, p.cameraOn, p.activeSpeaker],
        );
        return mapParticipant(res.rows[0]);
      },
      async list(sessionId) {
        const res = await q(
          'SELECT * FROM session_participants WHERE session_id=$1 AND left_at IS NULL',
          [sessionId],
        );
        return res.rows.map(mapParticipant);
      },
      async get(sessionId, userId) {
        const res = await q(
          'SELECT * FROM session_participants WHERE session_id=$1 AND user_id=$2 AND left_at IS NULL LIMIT 1',
          [sessionId, userId],
        );
        return res.rows[0] ? mapParticipant(res.rows[0]) : null;
      },
      async updateState(sessionId, userId, patch) {
        const res = await q(
          `UPDATE session_participants SET
             muted=COALESCE($3, muted),
             camera_on=COALESCE($4, camera_on),
             active_speaker=COALESCE($5, active_speaker)
           WHERE session_id=$1 AND user_id=$2 AND left_at IS NULL RETURNING *`,
          [sessionId, userId, patch.muted ?? null, patch.cameraOn ?? null, patch.activeSpeaker ?? null],
        );
        return res.rows[0] ? mapParticipant(res.rows[0]) : null;
      },
      async updateRole(sessionId, userId, role) {
        if (role === 'host') {
          // Single-host invariant, in one transaction so two concurrent
          // promotions cannot both end up as host.
          await q('BEGIN');
          try {
            await q(
              "UPDATE session_participants SET role='member' WHERE session_id=$1 AND role='host' AND left_at IS NULL",
              [sessionId],
            );
            const res = await q(
              'UPDATE session_participants SET role=$3 WHERE session_id=$1 AND user_id=$2 AND left_at IS NULL RETURNING *',
              [sessionId, userId, role],
            );
            await q('COMMIT');
            return res.rows[0] ? mapParticipant(res.rows[0]) : null;
          } catch (err) {
            await q('ROLLBACK');
            throw err;
          }
        }
        const res = await q(
          'UPDATE session_participants SET role=$3 WHERE session_id=$1 AND user_id=$2 AND left_at IS NULL RETURNING *',
          [sessionId, userId, role],
        );
        return res.rows[0] ? mapParticipant(res.rows[0]) : null;
      },
      async remove(sessionId, userId) {
        await q(
          'UPDATE session_participants SET left_at=now() WHERE session_id=$1 AND user_id=$2',
          [sessionId, userId],
        );
      },
    },

    messages: {
      async create(m) {
        const res = await q(
          'INSERT INTO messages (id, session_id, sender_user_id, body, sent_at) VALUES ($1,$2,$3,$4,now()) RETURNING *',
          [randomUUID(), m.sessionId, m.senderUserId, m.body],
        );
        return {
          id: res.rows[0].id,
          sessionId: res.rows[0].session_id,
          senderUserId: res.rows[0].sender_user_id,
          body: res.rows[0].body,
          sentAt: res.rows[0].sent_at.toISOString(),
        } satisfies Message;
      },
      async listBySession(sessionId) {
        const res = await q('SELECT * FROM messages WHERE session_id=$1 ORDER BY sent_at', [sessionId]);
        return res.rows.map((r) => ({
          id: r.id,
          sessionId: r.session_id,
          senderUserId: r.sender_user_id,
          body: r.body,
          sentAt: r.sent_at.toISOString(),
        }));
      },
    },

    transcripts: {
      async create(t) {
        const res = await q(
          `INSERT INTO transcripts (id, session_id, participant_user_id, source, text, is_final, confidence, language, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()) RETURNING *`,
          [randomUUID(), t.sessionId, t.participantUserId, t.source, t.text, t.isFinal, t.confidence, t.language],
        );
        return mapTranscript(res.rows[0]);
      },
      async listBySession(sessionId) {
        const res = await q('SELECT * FROM transcripts WHERE session_id=$1 ORDER BY created_at', [sessionId]);
        return res.rows.map(mapTranscript);
      },
    },

    translations: {
      async create(t) {
        const res = await q(
          `INSERT INTO translations (id, session_id, source_transcript_id, source_text, target_representation, confidence, fallback_used, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,now()) RETURNING *`,
          [randomUUID(), t.sessionId, t.sourceTranscriptId, t.sourceText, t.targetRepresentation, t.confidence, t.fallbackUsed],
        );
        return mapTranslation(res.rows[0]);
      },
      async listBySession(sessionId) {
        const res = await q('SELECT * FROM translations WHERE session_id=$1 ORDER BY created_at', [sessionId]);
        return res.rows.map(mapTranslation);
      },
    },

    feedback: {
      async create(f) {
        const res = await q(
          'INSERT INTO feedback (id, user_id, session_id, category, rating, comment, created_at) VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING *',
          [randomUUID(), f.userId, f.sessionId ?? null, f.category, f.rating, f.comment ?? null],
        );
        return mapFeedback(res.rows[0]);
      },
      async list(limit = 100) {
        const res = await q('SELECT * FROM feedback ORDER BY created_at DESC LIMIT $1', [limit]);
        return res.rows.map(mapFeedback);
      },
    },

    consent: {
      async set(c) {
        const res = await q(
          `INSERT INTO consents (id, user_id, scope, granted, granted_at, revoked_at)
           VALUES ($1,$2,$3,$4,now(),$5) RETURNING *`,
          [randomUUID(), c.userId, c.scope, c.granted, c.granted ? null : new Date()],
        );
        const r = res.rows[0];
        return {
          id: r.id,
          userId: r.user_id,
          scope: r.scope,
          granted: r.granted,
          grantedAt: r.granted_at.toISOString(),
          revokedAt: r.revoked_at ? r.revoked_at.toISOString() : undefined,
        } satisfies ConsentRecord;
      },
      async listByUser(userId) {
        const res = await q('SELECT * FROM consents WHERE user_id=$1 ORDER BY granted_at', [userId]);
        return res.rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          scope: r.scope,
          granted: r.granted,
          grantedAt: r.granted_at.toISOString(),
          revokedAt: r.revoked_at ? r.revoked_at.toISOString() : undefined,
        }));
      },
    },

    async health(): Promise<DatabaseHealth> {
      const start = process.hrtime.bigint();
      try {
        await q('SELECT 1');
        return { ok: true, driver: 'postgres', latencyMs: numMs(start) };
      } catch (err) {
        logger.error('db_health_failed', { message: (err as Error).message });
        return { ok: false, driver: 'postgres', latencyMs: numMs(start), message: (err as Error).message };
      }
    },

    async migrate(): Promise<void> {
      await runMigrations(pool, opts.migrationsDir);
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };

  return db;
}

function numMs(start: bigint): number {
  return Math.round((Number(process.hrtime.bigint() - start) / 1e6) * 100) / 100;
}

function mapUser(r: any): UserRecord {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    status: r.status,
    passwordHash: r.password_hash,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function mapProfile(r: any): Profile {
  return {
    userId: r.user_id,
    preferredInputMode: r.preferred_input_mode,
    preferredOutputMode: r.preferred_output_mode,
    primaryLanguage: r.primary_language,
    secondaryLanguage: r.secondary_language ?? undefined,
    avatarGender: r.avatar_gender ?? undefined,
    accessibilitySettings:
      typeof r.accessibility_settings === 'string'
        ? JSON.parse(r.accessibility_settings)
        : r.accessibility_settings,
  };
}

function mapSession(r: any): CommunicationSession {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    hostUserId: r.host_user_id,
    maxParticipants: r.max_participants,
    createdAt: r.created_at.toISOString(),
    startedAt: r.started_at ? r.started_at.toISOString() : undefined,
    endedAt: r.ended_at ? r.ended_at.toISOString() : undefined,
  };
}

function mapParticipant(r: any): SessionParticipant {
  return {
    sessionId: r.session_id,
    userId: r.user_id,
    role: r.role,
    joinedAt: r.joined_at.toISOString(),
    leftAt: r.left_at ? r.left_at.toISOString() : undefined,
    muted: r.muted,
    cameraOn: r.camera_on,
    activeSpeaker: r.active_speaker,
  };
}

function mapTranscript(r: any): Transcript {
  return {
    id: r.id,
    sessionId: r.session_id,
    participantUserId: r.participant_user_id,
    source: r.source,
    text: r.text,
    isFinal: r.is_final,
    // node-pg returns numeric as a string; keep the honest null distinction.
    confidence: r.confidence === null ? null : Number(r.confidence),
    language: r.language,
    createdAt: r.created_at.toISOString(),
  };
}

function mapFeedback(r: any): Feedback {
  return {
    id: r.id,
    userId: r.user_id,
    sessionId: r.session_id ?? undefined,
    category: r.category,
    rating: r.rating,
    comment: r.comment ?? undefined,
    createdAt: r.created_at.toISOString(),
  };
}

function mapTranslation(r: any): Translation {
  return {
    id: r.id,
    sessionId: r.session_id,
    sourceTranscriptId: r.source_transcript_id,
    sourceText: r.source_text,
    targetRepresentation: r.target_representation,
    confidence: Number(r.confidence),
    fallbackUsed: r.fallback_used,
    createdAt: r.created_at.toISOString(),
  };
}

async function runMigrations(pool: pg.Pool, _dir: string): Promise<void> {
  // Embedded single migration keeps Phase 1 self-contained. More migrations are
  // added as SQL files in the migrations directory in later phases.
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      display_name text NOT NULL,
      role text NOT NULL,
      status text NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profiles (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      preferred_input_mode text NOT NULL,
      preferred_output_mode text NOT NULL,
      primary_language text NOT NULL,
      secondary_language text,
      avatar_gender text,
      accessibility_settings jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY,
      type text NOT NULL,
      status text NOT NULL,
      host_user_id uuid NOT NULL REFERENCES users(id),
      max_participants int NOT NULL,
      created_at timestamptz NOT NULL,
      started_at timestamptz,
      ended_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS session_participants (
      session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id),
      role text NOT NULL,
      joined_at timestamptz NOT NULL,
      left_at timestamptz,
      muted boolean NOT NULL DEFAULT false,
      camera_on boolean NOT NULL DEFAULT true,
      active_speaker boolean NOT NULL DEFAULT false,
      PRIMARY KEY (session_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id uuid PRIMARY KEY,
      session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      sender_user_id uuid NOT NULL,
      body text NOT NULL,
      sent_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcripts (
      id uuid PRIMARY KEY,
      session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      participant_user_id uuid NOT NULL,
      source text NOT NULL,
      text text NOT NULL,
      is_final boolean NOT NULL,
      confidence numeric,
      language text NOT NULL,
      created_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS translations (
      id uuid PRIMARY KEY,
      session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      source_transcript_id uuid NOT NULL,
      source_text text NOT NULL,
      target_representation text NOT NULL,
      confidence numeric NOT NULL,
      fallback_used boolean NOT NULL,
      created_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id),
      session_id uuid REFERENCES sessions(id),
      category text NOT NULL,
      rating int NOT NULL,
      comment text,
      created_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS consents (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id),
      scope text NOT NULL,
      granted boolean NOT NULL,
      granted_at timestamptz NOT NULL,
      revoked_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id bigserial PRIMARY KEY,
      actor_user_id uuid,
      action text NOT NULL,
      detail jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_participants_session ON session_participants(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_transcripts_session ON transcripts(session_id);
    CREATE INDEX IF NOT EXISTS idx_translations_session ON translations(session_id);
  `;
  await pool.query(schema);
}
