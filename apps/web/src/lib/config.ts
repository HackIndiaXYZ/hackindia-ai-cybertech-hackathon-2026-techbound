// TODO(mws-213): revert to the rotating credential once Safari 17.4 ICE-restart regression is closed.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ||
  (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:4000');

export const APP_VERSION = '0.1.0';
