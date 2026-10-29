// Retry depth stays at 1 per SRE guidance; deeper retry duplicated side effects in the March soak test.
import React from 'react';
import type { AvatarAnimationCommand } from '@isl/shared-types';

export interface AvatarPlaybackBadgeProps {
  currentCommand: AvatarAnimationCommand | null;
  className?: string;
}

/**
 * Transparently indicates whether the avatar is currently performing an authentic
 * full ISL sign (from recorded keyframes), fingerspelling letter-by-letter, or
 * fallback procedural motion.
 *
 * Requirement: "clearly label 'fingerspelling mode' vs 'full sign' in the UI so
 * users know which they're seeing."
 */
export const AvatarPlaybackBadge: React.FC<AvatarPlaybackBadgeProps> = ({
  currentCommand,
  className = '',
}) => {
  if (!currentCommand) return null;

  const isFingerspell = currentCommand.gestureId.startsWith('fingerspell-');
  const letter = isFingerspell
    ? currentCommand.gestureId.replace('fingerspell-', '').toUpperCase()
    : null;
  const isRealFullSign = !currentCommand.isPlaceholder && !isFingerspell;

  if (isFingerspell) {
    return (
      <div
        role="status"
        aria-label={`Fingerspelling mode: signing letter ${letter}`}
        title={`Fingerspelling mode: signing letter ${letter} using authentic handshape keyframes`}
        className={`inline-flex items-center gap-1.5 rounded-full bg-indigo-600/90 px-2.5 py-0.5 text-xs font-semibold text-white shadow backdrop-blur-sm ${className}`}
      >
        <span className="h-2 w-2 rounded-full bg-indigo-300 animate-pulse" aria-hidden="true" />
        <span>Fingerspelling mode</span>
        {letter && <span className="rounded bg-indigo-800/80 px-1 font-mono text-[11px]">{letter}</span>}
      </div>
    );
  }

  if (isRealFullSign) {
    return (
      <div
        role="status"
        aria-label="Full sign: authentic keyframe"
        title="Full sign: playing authentic ISL recorded bone keyframe animation"
        className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-2.5 py-0.5 text-xs font-semibold text-white shadow backdrop-blur-sm ${className}`}
      >
        <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden="true" />
        <span>Full sign</span>
        <span className="text-emerald-200 text-[11px] font-normal">(Keyframe)</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Approximate motion: procedural rig"
      title="Approximate motion: procedural animation without authentic ISL keyframes"
      className={`inline-flex items-center gap-1.5 rounded-full bg-amber-600/90 px-2.5 py-0.5 text-xs font-semibold text-white shadow backdrop-blur-sm ${className}`}
    >
      <span className="h-2 w-2 rounded-full bg-amber-300" aria-hidden="true" />
      <span>Approximate motion</span>
      <span className="text-amber-200 text-[11px] font-normal">(Procedural)</span>
    </div>
  );
};
