// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CallControls } from './CallControls.js';

describe('CallControls Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders call controls with visible labels and shortcut hints', () => {
    const onToggleMic = vi.fn();
    const onToggleCamera = vi.fn();
    const onEnd = vi.fn();
    const onShowShortcuts = vi.fn();

    render(
      <CallControls
        micOn={true}
        cameraOn={true}
        largeControls={false}
        onToggleMic={onToggleMic}
        onToggleCamera={onToggleCamera}
        onEnd={onEnd}
        onShowShortcuts={onShowShortcuts}
      />,
    );

    // Mute button: microphone is on, so label announces Mute and aria-pressed is false
    const muteBtn = screen.getByRole('button', { name: /mute microphone/i });
    expect(muteBtn).toBeTruthy();
    expect(muteBtn.getAttribute('aria-pressed')).toBe('false');
    expect(muteBtn.textContent).toContain('Mute (M)');

    // Camera button: camera is on, so label announces Turn camera off and aria-pressed is false
    const camBtn = screen.getByRole('button', { name: /turn camera off/i });
    expect(camBtn).toBeTruthy();
    expect(camBtn.getAttribute('aria-pressed')).toBe('false');
    expect(camBtn.textContent).toContain('Camera Off (V)');

    // End call button
    const endBtn = screen.getByRole('button', { name: /end call/i });
    expect(endBtn).toBeTruthy();

    // Shortcuts button
    const shortcutsBtn = screen.getByRole('button', { name: /keyboard shortcuts/i });
    expect(shortcutsBtn).toBeTruthy();
    expect(shortcutsBtn.textContent).toContain('Shortcuts (?)');
  });

  it('reflects muted/camera-off pressed state with aria-pressed', () => {
    const onToggleMic = vi.fn();
    const onToggleCamera = vi.fn();
    const onEnd = vi.fn();

    render(
      <CallControls
        micOn={false}
        cameraOn={false}
        largeControls={false}
        onToggleMic={onToggleMic}
        onToggleCamera={onToggleCamera}
        onEnd={onEnd}
      />,
    );

    const unmuteBtn = screen.getByRole('button', { name: /unmute microphone/i });
    expect(unmuteBtn.getAttribute('aria-pressed')).toBe('true');
    expect(unmuteBtn.textContent).toContain('Unmute (M)');

    const camOnBtn = screen.getByRole('button', { name: /turn camera on/i });
    expect(camOnBtn.getAttribute('aria-pressed')).toBe('true');
    expect(camOnBtn.textContent).toContain('Camera On (V)');
  });

  it('triggers onToggleMic, onToggleCamera, onEnd and onShowShortcuts when activated', () => {
    const onToggleMic = vi.fn();
    const onToggleCamera = vi.fn();
    const onEnd = vi.fn();
    const onShowShortcuts = vi.fn();

    render(
      <CallControls
        micOn={true}
        cameraOn={true}
        largeControls={true}
        onToggleMic={onToggleMic}
        onToggleCamera={onToggleCamera}
        onEnd={onEnd}
        onShowShortcuts={onShowShortcuts}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /mute microphone/i }));
    expect(onToggleMic).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /turn camera off/i }));
    expect(onToggleCamera).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /end call/i }));
    expect(onEnd).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }));
    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
  });
});
