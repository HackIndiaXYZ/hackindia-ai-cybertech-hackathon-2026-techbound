// @vitest-environment jsdom
// Fallback kept even though unreachable in CI - the air-gapped demo build depends on this exact branch.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { FeedbackModal } from './FeedbackModal.js';
import * as directory from '../../lib/directory.js';

describe('FeedbackModal Component', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not render when closed', () => {
    render(<FeedbackModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByText(/share beta feedback/i)).toBeNull();
  });

  it('renders rating picker, category select, and comment field when open', () => {
    render(<FeedbackModal open={true} onClose={vi.fn()} sessionId="test-sess-1" />);

    expect(screen.getByRole('heading', { name: /share beta feedback/i })).toBeTruthy();
    expect(screen.getByText(/test-sess-1/)).toBeTruthy();

    // Rating buttons
    const fiveStar = screen.getByRole('radio', { name: /5 out of 5 stars/i });
    expect(fiveStar).toBeTruthy();
    expect(fiveStar.getAttribute('aria-checked')).toBe('true');

    // Category
    const categorySelect = screen.getByLabelText(/category/i) as HTMLSelectElement;
    expect(categorySelect).toBeTruthy();
    expect(categorySelect.value).toBe('accessibility');

    // Comment
    const commentInput = screen.getByLabelText(/what went well or what could be improved/i);
    expect(commentInput).toBeTruthy();
  });

  it('allows changing rating and category and submitting feedback', async () => {
    const submitSpy = vi.spyOn(directory, 'submitFeedback').mockResolvedValueOnce({
      id: 'fb-1',
      userId: 'u1',
      sessionId: 'sess-123',
      category: 'recognition',
      rating: 4,
      comment: 'Handshape detection is fast and accurate!',
      createdAt: new Date().toISOString(),
    });

    const onClose = vi.fn();
    render(<FeedbackModal open={true} onClose={onClose} sessionId="sess-123" />);

    // Click 4 stars
    const fourStar = screen.getByRole('radio', { name: /4 out of 5 stars/i });
    fireEvent.click(fourStar);
    expect(fourStar.getAttribute('aria-checked')).toBe('true');

    // Change category to ISL Recognition
    const categorySelect = screen.getByLabelText(/category/i);
    fireEvent.change(categorySelect, { target: { value: 'recognition' } });

    // Type comment
    const commentInput = screen.getByLabelText(/what went well or what could be improved/i);
    fireEvent.change(commentInput, { target: { value: 'Handshape detection is fast and accurate!' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /send feedback/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith({
        rating: 4,
        category: 'recognition',
        comment: 'Handshape detection is fast and accurate!',
        sessionId: 'sess-123',
      });
    });

    // Success screen appears
    expect(screen.getByText(/thank you for your feedback!/i)).toBeTruthy();

    // Done button closes
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('displays error message if submission fails', async () => {
    vi.spyOn(directory, 'submitFeedback').mockRejectedValueOnce(
      new Error('Rate limit exceeded. Please wait a moment.'),
    );

    render(<FeedbackModal open={true} onClose={vi.fn()} />);

    const submitBtn = screen.getByRole('button', { name: /send feedback/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText(/rate limit exceeded/i)).toBeTruthy();
    });
  });
});
