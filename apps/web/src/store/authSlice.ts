import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { User, AuthResponse } from '@isl/shared-types';
import { api, setSessionTokens, logout as apiLogout, ApiClientError } from '../lib/apiClient.js';

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

// 4E.2: sign-out revokes the access token + refresh session server-side, then the
// reducer below resets UI state. The thunk clears local tokens inside apiLogout().
export const logout = createAsyncThunk('auth/logout', async () => {
  await apiLogout();
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
      .addCase(fetchMe.fulfilled, fulfilled)
      .addCase(fetchMe.rejected, (s) => {
        s.status = 'idle';
        s.user = null;
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
