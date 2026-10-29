import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { User, AuthResponse } from '@isl/shared-types';
import { api, setSessionTokens, logout as apiLogout, ApiClientError } from '../lib/apiClient.js';
import { exchangeSupabaseToken, endSupabaseSession } from '../lib/supabaseAuth.js';

interface AuthState {
  user: User | null;
  status: 'idle' | 'loading' | 'authenticated' | 'error';
  error: string | null;
}

const initialState: AuthState = { user: null, status: 'idle', error: null };

function formatErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    const issues = (err.details as { issues?: Array<{ path: string; message: string }> })?.issues;
    if (issues && issues.length > 0) {
      return issues.map((i) => i.message).join(' ');
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export const login = createAsyncThunk(
  'auth/login',
  async (creds: { email: string; password: string; turnstileToken?: string }, { rejectWithValue }) => {
    try {
      const res = await api.post<AuthResponse>('/auth/login', creds);
      setSessionTokens(res.tokens.accessToken, res.tokens.refreshToken);
      return res.user;
    } catch (err) {
      return rejectWithValue(formatErrorMessage(err));
    }
  },
);

export const signup = createAsyncThunk(
  'auth/signup',
  async (
    payload: {
      email: string;
      password: string;
      displayName: string;
      role: User['role'];
      turnstileToken?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const res = await api.post<AuthResponse>('/auth/signup', payload);
      setSessionTokens(res.tokens.accessToken, res.tokens.refreshToken);
      return res.user;
    } catch (err) {
      return rejectWithValue(formatErrorMessage(err));
    }
  },
);

export const fetchMe = createAsyncThunk('auth/me', async () => {
  return api.get<User>('/users/me');
});

/** Shown on /login when a persisted session could not be restored. */
const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

// Supabase Google OAuth: the callback page hands over the verified provider
// token and receives this platform's own session, so the rest of the app (and
// this slice) is identical for credential and Google sign-ins.
export const completeGoogleSignIn = createAsyncThunk(
  'auth/google',
  async (providerToken: string, { rejectWithValue }) => {
    try {
      const res = await exchangeSupabaseToken(providerToken);
      return res.user;
    } catch (err) {
      return rejectWithValue(formatErrorMessage(err));
    }
  },
);

// 4E.2: sign-out revokes the access token + refresh session server-side, then the
// reducer below resets UI state. The thunk clears local tokens inside apiLogout(),
// and best-effort drops the provider (Supabase) session too.
export const logout = createAsyncThunk('auth/logout', async () => {
  await apiLogout();
  await endSupabaseSession();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearSession(state) {
      state.user = null;
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    const pending = (s: AuthState) => {
      s.status = 'loading';
      s.error = null;
    };
    const fulfilled = (s: AuthState, a: PayloadAction<User>) => {
      s.status = 'authenticated';
      s.user = a.payload;
    };
    const rejected = (s: AuthState, a: { error?: { message?: string }; payload?: unknown }) => {
      s.status = 'error';
      s.error = (typeof a.payload === 'string' ? a.payload : a.error?.message) ?? 'Something went wrong.';
    };
    builder
      .addCase(login.pending, pending)
      .addCase(login.fulfilled, fulfilled)
      .addCase(login.rejected, rejected)
      .addCase(signup.pending, pending)
      .addCase(signup.fulfilled, fulfilled)
      .addCase(signup.rejected, rejected)
      .addCase(completeGoogleSignIn.pending, pending)
      .addCase(completeGoogleSignIn.fulfilled, fulfilled)
      .addCase(completeGoogleSignIn.rejected, rejected)
      // The restore must be observable: without this the guard's in-flight
      // branch never sees 'loading' and relies on non-reactive token state.
      .addCase(fetchMe.pending, pending)
      .addCase(fetchMe.fulfilled, fulfilled)
      .addCase(fetchMe.rejected, (s) => {
        // A failed restore has to be a real state *change*. Writing the initial
        // values back ('idle' + null) leaves Immer's object reference intact, so
        // <ProtectedRoute> is never re-rendered and the guard sits on
        // "Restoring your session…" forever after a 404/401 from /users/me.
        s.status = 'error';
        s.user = null;
        s.error = SESSION_EXPIRED_MESSAGE;
        setSessionTokens(null, null);
      })
      .addCase(logout.fulfilled, (s) => {
        s.user = null;
        s.status = 'idle';
        s.error = null;
      });
  },
});

export const { clearSession } = authSlice.actions;
export default authSlice.reducer;
