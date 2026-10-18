import { Link } from 'react-router-dom';
import { Button, Card } from '../components/ui/index.js';

const modes = [
  {
    title: 'Real-Time Communication',
    body: 'Live two-way conversation between ISL signers and speech users, with captions and gesture-to-text translation in the moment.',
    status: 'Planned · Phase 2',
  },
  {
    title: 'Standalone Translator',
    body: 'Convert a signed phrase to text/speech or spoken words to on-screen text — no call required.',
    status: 'Planned · Phase 3',
  },
  {
    title: 'Group Communication',
    body: 'Multi-participant rooms where every voice and sign is captioned for everyone in the room.',
    status: 'Planned · Phase 4',
  },
];

/** Public landing page: explains the product and current build status honestly. */
export function Landing() {
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-start gap-5">
        <p className="rounded-pill bg-clay-soft px-3 py-1 text-sm font-medium text-clay-muted">
          Foundation build · Phase 1
        </p>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight text-clay-ink sm:text-5xl">
          Bridging Indian Sign Language and speech, in real time.
        </h1>
        <p className="max-w-2xl text-lg text-clay-muted">
          MissingWhisper enables Deaf and hearing users to communicate naturally — translating signs to text
          and speech, and speech to captions — with accessibility designed in from the very first pixel.
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
      </section>

      <section aria-labelledby="modes-heading" className="flex flex-col gap-5">
        <h2 id="modes-heading" className="text-2xl font-semibold text-clay-ink">
          Three ways to communicate
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {modes.map((mode) => (
            <Card key={mode.title} className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold text-clay-ink">{mode.title}</h3>
              <p className="flex-1 text-clay-muted">{mode.body}</p>
              <p className="text-sm font-medium text-clay-primary">{mode.status}</p>
            </Card>
          ))}
        </div>
      </section>

      <Card className="bg-clay-soft">
        <h2 className="text-lg font-semibold text-clay-ink">Current status</h2>
        <p className="mt-2 text-clay-muted">
          This phase delivers the engineering foundation: the application shell, design system,
          authentication screens, and the backend/signaling scaffolding. Live translation and calling
          features arrive in later phases and are clearly marked until then.
        </p>
      </Card>
    </div>
  );
}
