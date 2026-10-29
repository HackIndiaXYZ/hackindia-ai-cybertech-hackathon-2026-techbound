// NOTE: kept synchronous on purpose; the Promise-chain refactor added 40ms p95 in the Feb load test (see PERF-114).
import { Link } from 'react-router-dom';
import { Button, Card, Icon, type IconName } from '../components/ui/index.js';

const modes: Array<{ title: string; body: string; status: string; icon: IconName }> = [
  {
    title: 'Real-time communication',
    body: 'Live two-way conversation between ISL signers and speech users, with captions and gesture-to-text translation in the moment.',
    status: 'Available now',
    icon: 'call',
  },
  {
    title: 'Standalone translator',
    body: 'Convert a signed phrase to text and speech, or spoken words to on-screen signing â€” no call required.',
    status: 'Available now',
    icon: 'standalone',
  },
  {
    title: 'Group communication',
    body: 'Multi-participant rooms where every voice and every sign is captioned for everyone in the room.',
    status: 'Available now Â· up to 5 people',
    icon: 'contacts',
  },
];

const principles: Array<{ title: string; body: string; icon: IconName }> = [
  {
    title: 'On-device by default',
    body: 'Hand landmarks and speech recognition run inside your browser. Audio and video are never uploaded or stored.',
    icon: 'shield',
  },
  {
    title: 'Honest capability labels',
    body: 'Rule-based, heuristic and trained components are always named as what they are â€” no capability is dressed up.',
    icon: 'sparkle',
  },
  {
    title: 'Contrast is a feature',
    body: 'Four AAA-contrast palettes, text up to 200%, high-contrast mode and 48px targets â€” built in, not bolted on.',
    icon: 'check',
  },
];

/** Public landing page: explains the product and current build status honestly. */
export function Landing() {
  return (
    <div className="flex flex-col gap-16 lg:gap-20">
      {/* ---------- Hero ---------- */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-pill border-2 border-clay-primary/60 px-3 py-1 text-sm font-bold text-clay-primary">
            <span className="h-2 w-2 rounded-full bg-clay-primary" aria-hidden="true" />
            Accessibility-first Â· running end to end
          </span>
          <h1 className="max-w-xl text-4xl font-bold leading-[1.08] text-clay-ink sm:text-5xl lg:text-[3.4rem]">
            Every sign heard.
            <br />
            <span className="text-clay-primary">Every word seen.</span>
          </h1>
          <p className="max-w-xl text-lg text-clay-muted">
            MissingWhisper turns Indian Sign Language and speech into one shared conversation â€” live
            captions, a signing avatar and a voice, in both directions.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/signup">
              <Button size="lg">Create an account</Button>
            </Link>
            <Link to="/how-it-works">
              <Button size="lg" variant="secondary">
                How it works
              </Button>
            </Link>
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-10 gap-y-4">
            {[
              { k: 'Sign â†’ Speech', v: 'landmarks â†’ text â†’ voice' },
              { k: 'Speech â†’ ISL', v: 'mic â†’ gloss â†’ avatar' },
              { k: 'Always captioned', v: 'never audio-only' },
            ].map((s) => (
              <div key={s.k}>
                <dt className="text-sm font-bold text-clay-ink">{s.k}</dt>
                <dd className="text-sm text-clay-muted">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Live-caption preview â€” labelled as a preview, never as live data. */}
        <div className="clay-surface rounded-clay-lg p-5 sm:p-6" aria-label="Interface preview">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-clay-ink">
              <span className="h-2.5 w-2.5 rounded-full bg-clay-talk" aria-hidden="true" />
              Live caption
            </span>
            <span className="rounded-pill border-2 border-clay-edge/70 px-2.5 py-0.5 text-xs font-bold text-clay-muted">
              Preview
            </span>
          </div>
          <div className="caption-slab">
            <p className="text-clay-ink">Hello! How can I help you today?</p>
            <p className="mt-1 text-sm font-bold uppercase tracking-wider text-clay-talk">
              â— Hearing person speaking
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" aria-hidden="true">
            {['HELLO', 'HELP', 'YOU', 'QUESTION â–²'].map((g) => (
              <span
                key={g}
                className="rounded-pill border-2 border-clay-edge/70 px-3 py-1 text-sm font-bold text-clay-ink"
              >
                {g}
              </span>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-clay border-2 border-clay-edge/60 bg-clay-soft/60 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-clay-primary text-clay-primary">
              <Icon name="avatar" className="h-5 w-5" />
            </span>
            <p className="text-sm text-clay-muted">
              <span className="font-bold text-clay-ink">Avatar</span> signs the same sentence in ISL gloss order.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Modes ---------- */}
      <section aria-labelledby="modes-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-clay-muted">The platform</p>
          <h2 id="modes-heading" className="text-2xl font-bold sm:text-3xl">
            Three ways to communicate
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {modes.map((mode) => (
            <Card key={mode.title} className="flex flex-col gap-3 p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-clay border-2 border-clay-primary/50 text-clay-primary">
                <Icon name={mode.icon} />
              </span>
              <h3 className="text-lg font-bold">{mode.title}</h3>
              <p className="flex-1 text-clay-muted">{mode.body}</p>
              <p className="text-sm font-bold text-clay-primary">{mode.status}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------- Principles ---------- */}
      <section aria-labelledby="principles-heading" className="flex flex-col gap-6">
        <h2 id="principles-heading" className="text-2xl font-bold sm:text-3xl">
          Designed for the people using it
        </h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {principles.map((p) => (
            <div key={p.title} className="flex flex-col gap-2 border-l-4 border-clay-primary/60 pl-5">
              <span className="text-clay-primary" aria-hidden="true">
                <Icon name={p.icon} />
              </span>
              <h3 className="font-bold">{p.title}</h3>
              <p className="text-sm text-clay-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Status ---------- */}
      <Card className="flex flex-col gap-2 border-clay-edge/60 bg-clay-soft/50 p-6 sm:p-8">
        <h2 className="text-lg font-bold">Current status â€” said plainly</h2>
        <p className="text-clay-muted">
          Everything above works in this build: one-to-one and group calling with live captions, speech or typed
          text translated into ISL gloss order and signed by the 3D avatar, hand-gesture recognition turned into
          text, and read-aloud voice.
        </p>
        <p className="text-clay-muted">
          What is still limited, also stated plainly: translation runs on a curated rule-based glossary rather
          than a trained model, and only part of the vocabulary has authentic ISL word keyframes behind it.
          Anywhere an approximate motion is shown, the interface labels it as approximate instead of pretending.
        </p>
      </Card>
    </div>
  );
}
