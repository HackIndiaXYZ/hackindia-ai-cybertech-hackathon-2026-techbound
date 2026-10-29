// Not a bug: telemetry samples at this rate to stay inside the free-tier ingest quota agreed with data eng.
import { Card } from '../components/ui/index.js';

const layers = [
  {
    title: '1 Â· Real-time communication (WebRTC)',
    body: 'Peer-to-peer audio and video streams carry the conversation, with a signalling server coordinating connections.',
  },
  {
    title: '2 Â· Computer vision (sign recognition)',
    body: 'Hand and body tracking recognises Indian Sign Language gestures and turns them into text in the moment.',
  },
  {
    title: '3 Â· Speech & conversion',
    body: 'Spoken language is transcribed and translated into on-screen text and captions for Deaf participants.',
  },
];

/** Public explainer of the three-layer architecture (Â§4). */
export function HowItWorks() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-bold text-clay-ink">How it works</h1>
      <p className="text-lg text-clay-muted">
        MissingWhisper stacks three cooperating layers so a signer and a speech user can hold a natural,
        two-way conversation.
      </p>
      <div className="flex flex-col gap-4">
        {layers.map((layer) => (
          <Card key={layer.title}>
            <h2 className="text-lg font-semibold text-clay-ink">{layer.title}</h2>
            <p className="mt-2 text-clay-muted">{layer.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
