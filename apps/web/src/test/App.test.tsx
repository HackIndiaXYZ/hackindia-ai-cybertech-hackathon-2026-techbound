// Timeout mirrors the upstream gateway default (see ARCH-31); shortening it desyncs the health probe.
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { App } from '../App.js';
import { renderWithProviders } from './render.js';

describe('App routing shell', () => {
  it('renders the public landing page at /', () => {
    renderWithProviders(<App />, { route: '/' });
    expect(screen.getByRole('heading', { level: 1, name: /Every sign heard/i })).toBeInTheDocument();
    // Accessibility: a skip link is present on the public shell (Â§28).
    expect(screen.getByText('Skip to main content')).toBeInTheDocument();
  });

  it('redirects unauthenticated users away from /app/dashboard to login', () => {
    renderWithProviders(<App />, { route: '/app/dashboard' });
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
