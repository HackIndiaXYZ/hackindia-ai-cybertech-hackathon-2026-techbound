import { Link } from 'react-router-dom';
import { useAppSelector } from '../store/index.js';
import { Card, Button, StatusIndicator, Icon, type IconName } from '../components/ui/index.js';

interface ActionCard {
  title: string;
  body: string;
  to: string;
  cta: string;
  icon: IconName;
}

const START_CARDS: ActionCard[] = [
  {
    title: 'Start a call',
    body: 'Live video call with a peer, captions and sign translation side by side.',
    to: '/call/new',
    cta: 'Open call room',
    icon: 'call',
  },
  {
    title: 'Translator',
    body: 'Sign-to-text and speech-to-text without starting a call.',
    to: '/app/translator',
    cta: 'Open translator',
    icon: 'translator',
  },
];

const TOOL_CARDS: ActionCard[] = [
  {
    title: 'Standalone translator',
    body: 'Speak or type → large transcript → avatar signs it. No call needed.',
    to: '/app/standalone',
    cta: 'Open standalone',
    icon: 'standalone',
  },
  {
    title: 'Speech → ISL pipeline',
    body: 'Rule-based glossary translation driving the avatar (prototype).',
    to: '/app/pipeline',
    cta: 'Open pipeline',
    icon: 'pipeline',
  },
  {
    title: 'Voice / read-aloud',
    body: 'Browser text-to-speech: pick a voice, set pace, preview playback.',
    to: '/app/voice',
    cta: 'Open voice',
    icon: 'voice',
  },
  {
    title: '3D avatar',
    body: 'Avatar animation foundation (development placeholder).',
    to: '/app/avatar',
    cta: 'Open avatar',
    icon: 'avatar',
  },
];

const ACTIVITY_CARDS: ActionCard[] = [
  {
    title: 'History',
    body: 'Your saved sessions and the transcripts consent allowed us to keep.',
    to: '/app/history',
    cta: 'Open history',
    icon: 'history',
  },
  {
    title: 'Contacts',
    body: 'The people you have recently been in a session with.',
    to: '/app/contacts',
    cta: 'Open contacts',
    icon: 'contacts',
  },
  {
    title: 'Guided tour',
    body: 'New here? A 30-second walk-through of the essentials.',
    to: '/app/onboarding',
    cta: 'Take the tour',
    icon: 'sparkle',
  },
];

function ActionGrid({ cards, columns }: { cards: ActionCard[]; columns: string }) {
  return (
    <div className={`grid gap-5 ${columns}`}>
      {cards.map((card) => (
        <Card key={card.title} className="flex flex-col gap-3 p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-clay border-2 border-clay-primary/50 text-clay-primary">
            <Icon name={card.icon} />
          </span>
          <h3 className="text-lg font-bold">{card.title}</h3>
          <p className="flex-1 text-clay-muted">{card.body}</p>
          <Link to={card.to} className="mt-1">
            <Button variant="secondary" fullWidth>
              {card.cta}
            </Button>
          </Link>
        </Card>
      ))}
    </div>
  );
}

/** Authenticated home. Real-time features are honestly gated to later phases. */
export function Dashboard() {
  const user = useAppSelector((s) => s.auth.user);

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-clay-muted">Workspace</p>
        <h1 className="text-3xl font-bold sm:text-4xl">
          {user ? `Welcome, ${user.displayName}` : 'Welcome'}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusIndicator tone="success" label="Live calling is available (Phase 2A)" />
          <span className="rounded-pill border-2 border-clay-edge/60 px-3 py-0.5 text-xs font-bold text-clay-muted">
            Press <kbd className="font-mono">Tab</kbd> to navigate by keyboard
          </span>
        </div>
      </header>

      <section aria-labelledby="start-heading" className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="start-heading" className="text-xl font-bold sm:text-2xl">
            Start here
          </h2>
          <span className="text-sm text-clay-muted">Two doors into the same conversation</span>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {START_CARDS.map((card) => (
            <Card key={card.title} className="flex flex-col gap-3 p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-clay border-2 border-clay-primary bg-clay-primary/15 text-clay-primary">
                <Icon name={card.icon} />
              </span>
              <h3 className="text-lg font-bold">{card.title}</h3>
              <p className="flex-1 text-clay-muted">{card.body}</p>
              <Link to={card.to} className="mt-1">
                <Button fullWidth>{card.cta}</Button>
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="tools-heading" className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="tools-heading" className="text-xl font-bold sm:text-2xl">
            Translation tools
          </h2>
          <span className="text-sm text-clay-muted">Everything runs in your browser</span>
        </div>
        <ActionGrid cards={TOOL_CARDS} columns="sm:grid-cols-2" />
      </section>

      <section aria-labelledby="activity-heading" className="flex flex-col gap-5">
        <h2 id="activity-heading" className="text-xl font-bold sm:text-2xl">
          Your activity
        </h2>
        <ActionGrid cards={ACTIVITY_CARDS} columns="sm:grid-cols-3" />
      </section>
    </div>
  );
}
