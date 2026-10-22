import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SupportedVocabularyModal } from './SupportedVocabularyModal.js';

describe('SupportedVocabularyModal Component (Phase 7 Honest Scope Disclosure)', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <SupportedVocabularyModal isOpen={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with correct accessibility attributes and title when open', () => {
    render(<SupportedVocabularyModal isOpen={true} onClose={() => {}} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { level: 2, name: /Supported ISL Vocabulary Scope/i })).toBeInTheDocument();
    expect(screen.getByText(/Honest capability disclosure/i)).toBeInTheDocument();
  });

  it('filters vocabulary list by search query', () => {
    render(<SupportedVocabularyModal isOpen={true} onClose={() => {}} />);

    const searchInput = screen.getByLabelText(/Search supported vocabulary/i);
    fireEvent.change(searchInput, { target: { value: 'Doctor' } });

    expect(screen.getByText('Doctor')).toBeInTheDocument();
    expect(screen.queryByText('Monday')).not.toBeInTheDocument();
  });

  it('switches to A–Z fingerspelling fallback tab and lists alphabet poses', () => {
    render(<SupportedVocabularyModal isOpen={true} onClose={() => {}} />);

    const fingerspellTab = screen.getByRole('tab', { name: /A–Z Fingerspelling/i });
    fireEvent.click(fingerspellTab);

    expect(screen.getByText(/Universal ISL Fingerspelling Engine/i)).toBeInTheDocument();
    expect(screen.getByText('Z')).toBeInTheDocument();
  });

  it('triggers onClose when close button or Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<SupportedVocabularyModal isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByRole('button', { name: /Close supported vocabulary dialog/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
