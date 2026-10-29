import { Button } from '../ui/index.js';

interface CallControlsProps {
  micOn: boolean;
  cameraOn: boolean;
  largeControls: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onEnd: () => void;
  onShowShortcuts?: () => void;
}

/**
 * Primary call controls (§12: mute, camera toggle, end call). Uses large touch
 * targets when the user's accessibility setting requests it (§28).
 * Clearly labelled without relying on icons alone, displaying keyboard
 * shortcuts (M for mic, V for camera) and reflecting aria-pressed state.
 */
export function CallControls({
  micOn,
  cameraOn,
  largeControls,
  onToggleMic,
  onToggleCamera,
  onEnd,
  onShowShortcuts,
}: CallControlsProps) {
  const size = largeControls ? 'lg' : 'md';
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-3 sm:gap-4"
      role="group"
      aria-label="Call controls"
    >
      <Button
        variant={micOn ? 'secondary' : 'primary'}
        size={size}
        onClick={onToggleMic}
        aria-pressed={!micOn}
        aria-label={micOn ? 'Mute microphone (press M)' : 'Unmute microphone (press M)'}
        title={micOn ? 'Mute microphone (Shortcut: M)' : 'Unmute microphone (Shortcut: M)'}
        className="flex items-center gap-2 font-medium"
      >
        <span aria-hidden="true" className="text-base">{micOn ? '🎙️' : '🔇'}</span>
        <span>{micOn ? 'Mute (M)' : 'Unmute (M)'}</span>
      </Button>

      <Button
        variant={cameraOn ? 'secondary' : 'primary'}
        size={size}
        onClick={onToggleCamera}
        aria-pressed={!cameraOn}
        aria-label={cameraOn ? 'Turn camera off (press V)' : 'Turn camera on (press V)'}
        title={cameraOn ? 'Turn camera off (Shortcut: V)' : 'Turn camera on (Shortcut: V)'}
        className="flex items-center gap-2 font-medium"
      >
        <span aria-hidden="true" className="text-base">{cameraOn ? '📹' : '🚫'}</span>
        <span>{cameraOn ? 'Camera Off (V)' : 'Camera On (V)'}</span>
      </Button>

      {onShowShortcuts && (
        <Button
          variant="ghost"
          size={size}
          onClick={onShowShortcuts}
          aria-label="Keyboard shortcuts guide (press ?)"
          title="Keyboard shortcuts guide (Shortcut: ?)"
          className="flex items-center gap-1.5 font-medium text-clay-muted hover:text-clay-ink"
        >
          <span aria-hidden="true" className="text-base">⌨️</span>
          <span>Shortcuts (?)</span>
        </Button>
      )}

      <Button
        variant="danger"
        size={size}
        onClick={onEnd}
        aria-label="End call"
        className={largeControls ? 'min-h-14 px-8 text-lg font-medium' : 'font-medium'}
      >
        End call
      </Button>
    </div>
  );
}

