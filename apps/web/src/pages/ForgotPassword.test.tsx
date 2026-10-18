import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/directory.js', () => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

import { requestPasswordReset } from '../lib/directory.js';
import { ForgotPassword } from '../pages/ForgotPassword.js';
import { renderWithProviders } from '../test/render.js';

beforeEach(() => {
  vi.mocked(requestPasswordReset).mockReset();
});

describe('ForgotPassword (5.2)', () => {
  it('shows the same enumeration-safe confirmation whether or not the account exists', async () => {
    // The server always resolves 202; the UI must not reveal existence.
    vi.mocked(requestPasswordReset).mockResolvedValue({ accepted: true });
    renderWithProviders(<ForgotPassword />, { route: '/forgot-password' });

    await userEvent.type(screen.getByLabelText('Email', { exact: true }), 'someone@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() =>
      expect(screen.getByText(/If an account exists for/i)).toBeInTheDocument(),
    );
    expect(requestPasswordReset).toHaveBeenCalledWith('someone@example.com');
  });
});
