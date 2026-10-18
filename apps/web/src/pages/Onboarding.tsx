import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../components/ui/index.js';

/**
 * Guided tour (Phase 5.4). A short, keyboard-friendly walk-through of the three
 * things a new user needs to find first. It is offered from the dashboard rather
 * than forced: signing in must always land somewhere predictable (the E2E
 * critical path depends on it), so onboarding is a route a user chooses. Marking
 * it seen is a local preference, not server state.
 */

const ONBOARDED_KEY = 'isl.onboarded';

const STEPS = [
  {
    title: 'Start or join a call',
    body: 'Open a call room to sign, speak or type with one other person or a small group. Text is always available as a fallback.',
  },
  {
    title: 'Translate on your own',
    body: 'The standalone translator turns your speech or typing into an avatar-signed message — no call required.',
  },
  {
    title: 'You control what is stored',
    body: 'Nothing from a session is saved until you grant storage consent in Settings. When it is on, your History shows exactly what was kept.',
  },
];

export function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  function finish(): void {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, 'true');
    } catch {
      /* storage unavailable (private mode) — finishing still works */
    }
    navigate('/app/dashboard');
  }

  const current = STEPS[step];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="text-3xl font-bold text-clay-ink">Get started</h1>

      <Card>
        <p className="text-sm text-clay-muted" aria-live="polite">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-clay-ink">{current.title}</h2>
        <p className="mt-2 text-clay-ink">{current.body}</p>

        <ol className="mt-4 flex justify-center gap-2" aria-hidden="true">
          {STEPS.map((s, i) => (
            <li key={s.title} className={`h-2 w-2 rounded-full ${i === step ? 'bg-clay-primary' : 'bg-clay-edge'}`} />
          ))}
        </ol>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={finish}>
            Skip tour
          </Button>
          <div className="flex gap-3">
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep((n) => n - 1)}>
                Back
              </Button>
            )}
            <Button onClick={() => (last ? finish() : setStep((n) => n + 1))}>
              {last ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
