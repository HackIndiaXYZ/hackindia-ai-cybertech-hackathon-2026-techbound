import { Link } from 'react-router-dom';
import { useAppSelector } from '../store/index.js';
import { Card, Button, StatusIndicator } from '../components/ui/index.js';

/** Authenticated home. Real-time features are honestly gated to later phases. */
export function Dashboard() {
  const user = useAppSelector((s) => s.auth.user);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-clay-ink">
          {user ? `Welcome, ${user.displayName}` : 'Welcome'}
        </h1>
        <StatusIndicator tone="success" label="Live calling is available (Phase 2A)" />
      </section>

      <section aria-labelledby="quick-actions" className="flex flex-col gap-4">
        <h2 id="quick-actions" className="text-xl font-semibold text-clay-ink">
          Quick actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-clay-ink">Start a call</h3>
            <p className="flex-1 text-clay-muted">Live video call with a peer and text fallback.</p>
            <Link to="/call/new">
              <Button variant="secondary" fullWidth>
                Open call room
              </Button>
            </Link>
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-clay-ink">Translator</h3>
            <p className="flex-1 text-clay-muted">Sign-to-text and speech-to-text without a call.</p>
            <Link to="/app/translator">
              <Button variant="secondary" fullWidth>
                Open translator
              </Button>
            </Link>
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-clay-ink">3D Avatar</h3>
            <p className="flex-1 text-clay-muted">Avatar animation foundation (development placeholder).</p>
            <Link to="/app/avatar">
              <Button variant="secondary" fullWidth>
                Open avatar
              </Button>
            </Link>
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-clay-ink">Speech → ISL Pipeline</h3>
            <p className="flex-1 text-clay-muted">Rule-based glossary translation driving the avatar (prototype).</p>
            <Link to="/app/pipeline">
              <Button variant="secondary" fullWidth>
                Open pipeline
              </Button>
            </Link>
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-clay-ink">Voice / Read-aloud</h3>
            <p className="flex-1 text-clay-muted">Text-to-speech settings, preview and playback (browser voice).</p>
            <Link to="/app/voice">
              <Button variant="secondary" fullWidth>
                Open voice
              </Button>
            </Link>
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-clay-ink">Standalone Translator</h3>
            <p className="flex-1 text-clay-muted">Speak or type → huge transcript → avatar signs it. No call needed.</p>
            <Link to="/app/standalone">
              <Button variant="secondary" fullWidth>
                Open standalone
              </Button>
            </Link>
          </Card>
        </div>
      </section>

      <section aria-labelledby="recent" className="flex flex-col gap-4">
        <h2 id="recent" className="text-xl font-semibold text-clay-ink">
          Pick up where you left off
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-clay-ink">History</h3>
            <p className="flex-1 text-clay-muted">Your saved sessions and the transcripts consent allowed us to keep.</p>
            <Link to="/app/history">
              <Button variant="secondary" fullWidth>
                Open history
              </Button>
            </Link>
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-clay-ink">Contacts</h3>
            <p className="flex-1 text-clay-muted">The people you have recently been in a session with.</p>
            <Link to="/app/contacts">
              <Button variant="secondary" fullWidth>
                Open contacts
              </Button>
            </Link>
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-clay-ink">Guided tour</h3>
            <p className="flex-1 text-clay-muted">New here? A 30-second walk-through of the essentials.</p>
            <Link to="/app/onboarding">
              <Button variant="secondary" fullWidth>
                Take the tour
              </Button>
            </Link>
          </Card>
        </div>
      </section>
    </div>
  );
}
