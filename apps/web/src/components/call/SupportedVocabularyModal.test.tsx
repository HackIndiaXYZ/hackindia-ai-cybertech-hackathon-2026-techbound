import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SupportedVocabularyModal } from './SupportedVocabularyModal.js';

describe('SupportedVocabularyModal scope disclosure', () => {
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
    expect(screen.getByText(/signs the avatar performs with real keyframes/i)).toBeInTheDocument();
  });

  it('only advertises avatar animation for terms the rig has real keyframes for', () => {
    render(<SupportedVocabularyModal isOpen={true} onClose={() => {}} />);

    // 'Thank You' maps to sign-thank, which has authentic keyframes.
    const thankYou = screen.getByText('Thank You').closest('div');
    expect(within(thankYou as HTMLElement).getByTitle('Animated by 3D Avatar')).toBeInTheDocument();

    // 'Doctor' maps to sign-doctor, which has no keyframes — the avatar spells it,
    // so claiming it as an animated sign would be an over-claim.
    const doctor = screen.getByText('Doctor').closest('div');
    expect(within(doctor as HTMLElement).queryByTitle('Animated by 3D Avatar')).not.toBeInTheDocument();
  });

  it('derives the avatar tab count from the same keyframe check as the badges', () => {
    render(<SupportedVocabularyModal isOpen={true} onClose={() => {}} />);

    const avatarTab = screen.getByRole('tab', { name: /Avatar Signs \(\d+\)/ });
    const count = Number(/\((\d+)\)/.exec(avatarTab.textContent ?? '')?.[1]);
    const total = Number(/\((\d+)\)/.exec(screen.getByRole('tab', { name: /^All \(\d+\)$/ }).textContent ?? '')?.[1]);
    fireEvent.click(avatarTab);

    // The advertised avatar scope is strictly narrower than the full list.
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(total);
    expect(screen.queryByText('Thank You')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByText('Monday')).not.toBeInTheDocument();
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
