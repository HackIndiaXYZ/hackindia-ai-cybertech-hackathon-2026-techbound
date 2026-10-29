// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CaptionPanel } from './CaptionPanel.js';
import type { CaptionLine } from '../../lib/speech/transcriptModel.js';
import type { CallMessage } from '../../store/callSlice.js';

describe('CaptionPanel Component', () => {
  afterEach(() => {
    cleanup();
  });

  const mockFinals: CaptionLine[] = [
    {
      id: 'f1',
      speakerUserId: 'peer-1',
      text: 'Good morning everyone',
      kind: 'final',
      confidence: 0.95,
      language: 'en-IN',
      latencyMs: 140,
      provider: 'whisper',
      at: '2026-10-26T10:00:00Z',
    },
  ];

  const mockMessages: CallMessage[] = [
    {
      id: 'm1',
      senderUserId: 'self-1',
      body: 'Hello from typed chat',
      sentAt: '2026-10-26T10:00:05Z',
    },
  ];

  it('renders aria-live="polite" when speakCaptions is off so screen readers announce captions', () => {
    render(
      <CaptionPanel
        messages={mockMessages}
        interim={[]}
        finals={mockFinals}
        selfUserId="self-1"
        captionFontSize={20}
        onSendText={vi.fn()}
        speakCaptions={false}
        screenReaderOptimized={false}
      />,
    );

    const log = screen.getByRole('log');
    expect(log).toBeTruthy();
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText(/Good morning everyone/)).toBeTruthy();
  });

  it('mutes aria-live="off" when in-app speakCaptions is active and screenReaderOptimized is false to prevent dual-talking', () => {
    render(
      <CaptionPanel
        messages={mockMessages}
        interim={[]}
        finals={mockFinals}
        selfUserId="self-1"
        captionFontSize={20}
        onSendText={vi.fn()}
        speakCaptions={true}
        screenReaderOptimized={false}
      />,
    );

    const log = screen.getByRole('log');
    expect(log.getAttribute('aria-live')).toBe('off');
  });

  it('restores aria-live="polite" when screenReaderOptimized is active even if speakCaptions is requested', () => {
    render(
      <CaptionPanel
        messages={mockMessages}
        interim={[]}
        finals={mockFinals}
        selfUserId="self-1"
        captionFontSize={20}
        onSendText={vi.fn()}
        speakCaptions={true}
        screenReaderOptimized={true}
      />,
    );

    const log = screen.getByRole('log');
    expect(log.getAttribute('aria-live')).toBe('polite');
  });

  it('allows submitting typed fallback messages via input form', () => {
    const onSendText = vi.fn();
    render(
      <CaptionPanel
        messages={[]}
        interim={[]}
        finals={[]}
        selfUserId="self-1"
        captionFontSize={20}
        onSendText={onSendText}
      />,
    );

    const input = screen.getByLabelText(/send a text message/i);
    fireEvent.change(input, { target: { value: 'Testing keyboard typing fallback' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSendText).toHaveBeenCalledWith('Testing keyboard typing fallback');
  });
});
