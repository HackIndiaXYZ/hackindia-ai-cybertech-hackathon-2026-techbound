// Not a bug: telemetry samples at this rate to stay inside the free-tier ingest quota agreed with data eng.
import { useState } from 'react';
import { Modal, Button } from '../ui/index.js';
import { submitFeedback } from '../../lib/directory.js';

export type FeedbackCategory =
  | 'recognition'
  | 'translation'
  | 'performance'
  | 'accessibility'
  | 'other';

export interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  sessionId?: string;
  initialCategory?: FeedbackCategory;
}

const CATEGORIES: { id: FeedbackCategory; label: string; desc: string }[] = [
  { id: 'accessibility', label: 'Accessibility', desc: 'Screen readers, contrast, earcons, keyboard' },
  { id: 'recognition', label: 'ISL Recognition', desc: 'Hand tracking, camera sign detection' },
  { id: 'translation', label: 'Translation & Avatar', desc: 'Grammar, speech captions, 3D interpreter' },
  { id: 'performance', label: 'Call Performance', desc: 'Audio/video clarity, lag, connection' },
  { id: 'other', label: 'General / Suggestion', desc: 'Feature requests or general feedback' },
];

/**
 * In-app beta feedback modal (Phase 5.5, closes P2-2).
 * Allows testers and participants to submit structured feedback with ratings,
 * categories, and optional comments, persisted to the database and read back
 * by admins on /app/admin.
 */
export function FeedbackModal({
  open,
  onClose,
  sessionId,
  initialCategory = 'accessibility',
}: FeedbackModalProps) {
  const [rating, setRating] = useState<number>(5);
  const [category, setCategory] = useState<FeedbackCategory>(initialCategory);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setRating(5);
    setCategory(initialCategory);
    setComment('');
    setError(null);
    setSubmitted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await submitFeedback({
        rating,
        category,
        comment: comment.trim() || undefined,
        sessionId,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit feedback. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Share Beta Feedback">
      {submitted ? (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="text-4xl" aria-hidden="true">ðŸŽ‰</span>
          <h3 className="text-xl font-bold text-clay-ink">Thank you for your feedback!</h3>
          <p className="max-w-md text-sm text-clay-muted">
            Your observations help make MissingWhisper genuinely accessible and robust for deaf, hard-of-hearing, and blind users.
          </p>
          <Button variant="primary" onClick={handleClose} className="mt-2">
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2 text-clay-ink">
          {sessionId && (
            <p className="text-xs text-clay-muted">
              Attaching feedback to session <span className="font-mono text-clay-ink">{sessionId}</span>
            </p>
          )}

          {/* Rating */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-clay-ink" id="rating-label">
              Overall experience (1 to 5)
            </label>
            <div
              className="flex items-center gap-2"
              role="radiogroup"
              aria-labelledby="rating-label"
            >
              {[1, 2, 3, 4, 5].map((num) => {
                const active = rating === num;
                return (
                  <button
                    key={num}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${num} out of 5 stars`}
                    onClick={() => setRating(num)}
                    className={`flex h-11 w-11 items-center justify-center rounded-clay border-2 text-base font-bold transition-colors ${
                      active
                        ? 'border-clay-primary bg-clay-primary text-clay-primary-ink shadow-clay-sm'
                        : 'border-clay-edge/70 bg-clay-surface text-clay-ink hover:bg-clay-soft'
                    }`}
                  >
                    {num}â˜…
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="feedback-category" className="text-sm font-semibold text-clay-ink">
              Category
            </label>
            <select
              id="feedback-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
              className="h-11 rounded-clay border-2 border-clay-edge/70 bg-clay-surface px-3 text-sm text-clay-ink focus:border-clay-primary focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} â€” {c.desc}
                </option>
              ))}
            </select>
          </div>

          {/* Comments */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="feedback-comment" className="text-sm font-semibold text-clay-ink">
                What went well or what could be improved?
              </label>
              <span className="text-xs text-clay-muted">{comment.length} / 2000</span>
            </div>
            <textarea
              id="feedback-comment"
              rows={4}
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us about sign recognition accuracy, audio cues, screen reader experience, or suggestionsâ€¦"
              className="rounded-clay border-2 border-clay-edge/70 bg-clay-soft p-3 text-sm text-clay-ink placeholder:text-clay-muted focus:border-clay-primary focus:outline-none"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-clay bg-clay-danger/15 p-3 text-sm font-medium text-clay-danger">
              {error}
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-3">
            <Button variant="ghost" type="button" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={busy} disabled={busy}>
              Send feedback
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
