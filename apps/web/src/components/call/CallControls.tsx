import { IconButton, Button } from '../ui/index.js';

interface CallControlsProps {
  micOn: boolean;
  cameraOn: boolean;
  largeControls: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onEnd: () => void;
}

/**
 * Primary call controls (§12: mute, camera toggle, end call). Uses large touch
 * targets when the user's accessibility setting requests it (§28). Every icon
 * button carries an accessible name and reflects pressed state.
 */
export function CallControls({
  micOn,
  cameraOn,
  largeControls,
  onToggleMic,
  onToggleCamera,
  onEnd,
}: CallControlsProps) {
  const size = largeControls ? 'lg' : 'md';
  return (
    <div className="flex items-center justify-center gap-4" role="group" aria-label="Call controls">
      <IconButton
        label={micOn ? 'Mute microphone' : 'Unmute microphone'}
        size={size}
        active={!micOn}
        onClick={onToggleMic}
        aria-pressed={!micOn}
      >
        <span aria-hidden="true">{micOn ? '🎙️' : '🔇'}</span>
      </IconButton>

      <IconButton
        label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
        size={size}
        active={!cameraOn}
        onClick={onToggleCamera}
        aria-pressed={!cameraOn}
      >
        <span aria-hidden="true">{cameraOn ? '📹' : '🚫'}</span>
      </IconButton>

      <Button
        variant="danger"
        onClick={onEnd}
        className={largeControls ? 'min-h-14 px-8 text-lg' : undefined}
      >
        End call
      </Button>
    </div>
  );
}
