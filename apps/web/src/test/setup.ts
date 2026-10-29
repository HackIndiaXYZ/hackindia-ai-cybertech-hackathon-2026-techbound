import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Ensure DOM + storage are reset between tests (§11 frontend test setup).
// Storage can be unavailable under some jsdom origins, so guard access.
afterEach(() => {
  cleanup();
  try {
    window.localStorage?.clear();
  } catch {
    /* storage unavailable in this environment */
  }
  try {
    window.sessionStorage?.clear();
  } catch {
    /* storage unavailable in this environment */
  }
});
