import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '../ui/index.js';
import { DEFAULT_GLOSSARY } from '../../lib/translation/index.js';
import { PLACEHOLDER_GESTURE_REGISTRY } from '../../lib/avatar/index.js';

export interface SupportedVocabularyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface VocabularyItem {
  term: string;
  category: 'core-sign' | 'fingerspell-supported' | 'conversational';
  cameraRecognized: boolean; // Recognized by ISL ML engine
  avatarAnimated: boolean;   // Has dedicated 3D avatar animation
  avatarExpression?: string;
  description: string;
}

/**
 * Does this rig actually have an authentic keyframe clip for the term? Resolved
 * from the real glossary → clip registry chain instead of a hand-set flag, so the
 * modal can never advertise a sign the avatar cannot perform. A term counts only
 * when every clip its glossary entry maps to is a real keyframe clip; a term that
 * would be fingerspelled is reported as not animated, because it is spelled, not
 * signed.
 */
function hasAuthenticClip(term: string): boolean {
  const keys = term
    .toLowerCase()
    .split(' / ')
    .map((part) => part.trim());
  for (const key of keys) {
    const entry = DEFAULT_GLOSSARY.find((g) => g.forms.includes(key));
    if (!entry || entry.gestureIds.length === 0) continue;
    if (entry.gestureIds.every((id) => Boolean(PLACEHOLDER_GESTURE_REGISTRY[id]?.realClip))) return true;
  }
  return false;
}

// 28 dynamic ISL ML classes + additional conversational signs
const VOCABULARY_INTENT: VocabularyItem[] = [
  { term: 'City', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Buildings outline formation' },
  { term: 'Dog', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Patting motion' },
  { term: 'Hat', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Head brim touch gesture' },
  { term: 'He / She', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Index finger pointing rightwards' },
  { term: 'I / Self', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Index finger to chest center' },
  { term: 'Market', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Trading alternating hand waves' },
  { term: 'Park', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Open trees / green space sweep' },
  { term: 'School', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Book opening / clapping motion' },
  { term: 'Shirt', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Collar tugging motion' },
  { term: 'Black', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Forehead swipe gesture' },
  { term: 'Child', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Head height pat gesture' },
  { term: 'Doctor', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Wrist pulse checking gesture' },
  { term: 'Dress', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Downward cloth flow motion' },
  { term: 'Father', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Forehead open-5 salute gesture' },
  { term: 'Girl', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Jawline stroke gesture' },
  { term: 'Happy', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, avatarExpression: 'affirmative', description: 'Chest-upward brushing motion' },
  { term: 'Heavy', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Two-hand weighted drop' },
  { term: 'Home', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Roof hands peak touching' },
  { term: 'Hospital', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Cross mark on upper arm' },
  { term: 'How Are You', category: 'conversational', cameraRecognized: true, avatarAnimated: true, avatarExpression: 'question', description: 'Two open palms flipped upward questioning' },
  { term: 'Monday', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'M-handshape circular sweep' },
  { term: 'Night', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Sun setting over horizon arm' },
  { term: 'Shoe', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Two fist bumps (shoes)' },
  { term: 'Street', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Parallel open palms forward path' },
  { term: 'Thank You', category: 'conversational', cameraRecognized: true, avatarAnimated: true, description: 'Chin to forward open flat palm' },
  { term: 'Yellow', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Y-handshape twisting motion' },
  { term: 'You', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Index finger pointing forward' },
  { term: 'Namaste / Hello', category: 'conversational', cameraRecognized: true, avatarAnimated: true, description: 'Two palms pressed together (Anjali mudra)' },
  { term: 'Help', category: 'conversational', cameraRecognized: true, avatarAnimated: true, description: 'Flat palm lifting thumbs-up fist' },
  { term: 'Water', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'W-handshape tapping chin' },
  { term: 'Food / Eat', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Fingertips to mouth repeatedly' },
  { term: 'Where', category: 'conversational', cameraRecognized: true, avatarAnimated: true, avatarExpression: 'question', description: 'Two palms up questioning side to side' },
  { term: 'No', category: 'conversational', cameraRecognized: true, avatarAnimated: true, avatarExpression: 'negative', description: 'Index and middle snap to thumb' },
  { term: 'Yes', category: 'conversational', cameraRecognized: true, avatarAnimated: true, avatarExpression: 'affirmative', description: 'S-fist nodding like a head' },
  { term: 'Please', category: 'conversational', cameraRecognized: true, avatarAnimated: true, description: 'Circular chest rub with flat palm' },
  { term: 'Sorry', category: 'conversational', cameraRecognized: true, avatarAnimated: true, description: 'A-fist circular chest rub' },
  { term: 'Stop', category: 'conversational', cameraRecognized: true, avatarAnimated: true, description: 'Open palm chop into flat palm' },
  { term: 'Time', category: 'core-sign', cameraRecognized: true, avatarAnimated: true, description: 'Index tap on watch wrist' },
];

/**
 * The published list re-derives `avatarAnimated` from the rig's real keyframe
 * registry, so the disclosed scope can never be wider than what the avatar
 * actually signs. Terms without a keyframe clip are fingerspelled instead.
 */
export const SUPPORTED_VOCABULARY: VocabularyItem[] = VOCABULARY_INTENT.map((item) => ({
  ...item,
  avatarAnimated: item.avatarAnimated && hasAuthenticClip(item.term),
}));

/** Sign counts derived from the same data the lists render, so no surface can
 * quote a scope wider than what is actually itemised. */
export const CAMERA_SIGN_COUNT = SUPPORTED_VOCABULARY.filter((item) => item.cameraRecognized).length;
export const AVATAR_SIGN_COUNT = SUPPORTED_VOCABULARY.filter((item) => item.avatarAnimated).length;

export const SupportedVocabularyModal: React.FC<SupportedVocabularyModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'camera' | 'avatar' | 'fingerspell'>('all');

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredItems = useMemo(() => {
    return SUPPORTED_VOCABULARY.filter((item) => {
      const matchesSearch =
        item.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;
      if (activeTab === 'camera') return item.cameraRecognized;
      if (activeTab === 'avatar') return item.avatarAnimated;
      return true;
    });
  }, [searchTerm, activeTab]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vocab-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative flex flex-col w-full max-w-3xl max-h-[85vh] rounded-clay border border-clay-soft bg-clay-surface p-6 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-clay-soft">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">📖</span>
              <h2 id="vocab-modal-title" className="text-xl font-bold text-clay-ink">
                Supported ISL Vocabulary Scope
              </h2>
            </div>
            <p className="mt-1 text-xs text-clay-muted">
              {AVATAR_SIGN_COUNT} signs the avatar performs with real keyframes, {CAMERA_SIGN_COUNT} signs the
              recognition service is documented to classify, and A–Z fingerspelling for everything else.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close supported vocabulary dialog"
            className="p-1 rounded hover:bg-clay-soft text-clay-muted hover:text-clay-ink transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter Controls & Search */}
        <div className="flex flex-col gap-3 py-3 border-b border-clay-soft sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1.5" role="tablist" aria-label="Vocabulary category filters">
            <Button
              size="sm"
              variant={activeTab === 'all' ? 'primary' : 'ghost'}
              role="tab"
              aria-selected={activeTab === 'all'}
              onClick={() => setActiveTab('all')}
            >
              All ({SUPPORTED_VOCABULARY.length})
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'camera' ? 'primary' : 'ghost'}
              role="tab"
              aria-selected={activeTab === 'camera'}
              onClick={() => setActiveTab('camera')}
            >
              Camera Signs ({CAMERA_SIGN_COUNT})
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'avatar' ? 'primary' : 'ghost'}
              role="tab"
              aria-selected={activeTab === 'avatar'}
              onClick={() => setActiveTab('avatar')}
            >
              Avatar Signs ({AVATAR_SIGN_COUNT})
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'fingerspell' ? 'primary' : 'ghost'}
              role="tab"
              aria-selected={activeTab === 'fingerspell'}
              onClick={() => setActiveTab('fingerspell')}
            >
              A–Z Fingerspelling
            </Button>
          </div>

          <div className="relative w-full sm:w-60">
            <input
              type="text"
              placeholder="Search sign or phrase…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search supported vocabulary"
              className="w-full px-3 py-1.5 text-xs rounded-clay border border-clay-soft bg-clay-soft/40 text-clay-ink placeholder-clay-muted focus:outline-none focus:ring-2 focus:ring-clay-primary"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
                className="absolute right-2 top-2 text-xs text-clay-muted hover:text-clay-ink"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-3 pr-1 space-y-2">
          {activeTab === 'fingerspell' ? (
            <div className="flex flex-col gap-3 p-4 rounded-clay bg-clay-soft/40 border border-clay-soft text-xs text-clay-ink">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔤</span>
                <h3 className="font-bold text-sm">Universal ISL Fingerspelling Engine</h3>
              </div>
              <p className="text-clay-muted leading-relaxed">
                When a user speaks or writes a word outside the {SUPPORTED_VOCABULARY.length} curated signs, the avatar does <strong>not</strong> fail silently or freeze. Instead, it decomposes the word into alphabetic letters and animates authentic ISL fingerspelling poses:
              </p>
              <div className="grid grid-cols-6 sm:grid-cols-9 gap-2 text-center font-mono font-semibold pt-1">
                {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((char) => (
                  <div key={char} className="p-2 rounded bg-clay-surface border border-clay-soft shadow-sm">
                    {char}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-clay-muted pt-2 border-t border-clay-soft">
                ⚡ Backed by authentic Mixamo skeletal bone rotation keyframes (<code className="font-mono">sign-a</code> through <code className="font-mono">sign-z</code>).
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredItems.map((item) => (
                <div
                  key={item.term}
                  className="flex flex-col justify-between p-3 rounded-clay border border-clay-soft bg-clay-soft/30 hover:bg-clay-soft/60 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-sm text-clay-ink">{item.term}</span>
                      <div className="flex items-center gap-1">
                        {item.cameraRecognized && (
                          <span
                            title="Recognized by ISL camera ML model"
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                          >
                            🤟 Vision
                          </span>
                        )}
                        {item.avatarAnimated && (
                          <span
                            title="Animated by 3D Avatar"
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/20"
                          >
                            🧑‍🦲 3D Rig
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-clay-muted">{item.description}</p>
                  </div>
                  {item.avatarExpression && (
                    <span className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">
                      Facial cue: <em>{item.avatarExpression}</em>
                    </span>
                  )}
                </div>
              ))}
              {filteredItems.length === 0 && (
                <div className="col-span-2 py-8 text-center text-xs text-clay-muted">
                  No vocabulary matching &quot;{searchTerm}&quot;. Any unlisted words will seamlessly execute via the <strong>A–Z Fingerspelling Engine</strong>.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with honest scope note */}
        <div className="pt-3 border-t border-clay-soft flex flex-col gap-2 text-xs text-clay-muted">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <span>
              💡 Any unlisted words automatically fallback to <strong>ISL letter-by-letter fingerspelling</strong>.
            </span>
            <Button size="sm" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
          <p>
            The <strong>3D Rig</strong> badge is verified against this build's keyframe registry. The
            <strong> Vision</strong> badge is the recognition service's own documented scope — its trained
            vocabulary lives inside model files that the browser cannot enumerate, so it is stated, not measured.
          </p>
        </div>
      </div>
    </div>
  );
};
