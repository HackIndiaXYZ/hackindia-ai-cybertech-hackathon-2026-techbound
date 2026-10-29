import { Card } from '../components/ui/index.js';

const commitments = [
  'Keyboard navigation for every interactive control, with a visible focus indicator.',
  'Semantic HTML and ARIA only where it improves the experience.',
  'Sufficient colour contrast (WCAG 2.1 AA) and status cues that never rely on colour alone.',
  'Live captions and visual alternatives for all audio states.',
  'Respect for reduced-motion preferences and a manual override.',
  'User-adjustable control sizes and caption text.',
  'Plain-language, recoverable error messages.',
];

/** Public accessibility statement — a product commitment, not a QA checkbox (§28). */
export function AccessibilityStatement() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-bold text-clay-ink">Accessibility statement</h1>
      <p className="text-lg text-clay-muted">
        Accessibility is a first-class product requirement for MissingWhisper. The platform exists to remove
        communication barriers, so it must not create new ones.
      </p>

      <Card>
        <h2 className="text-xl font-semibold text-clay-ink">Our commitments</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-clay-ink">
          {commitments.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <Card className="bg-clay-soft">
        <h2 className="text-lg font-semibold text-clay-ink">Target</h2>
        <p className="mt-2 text-clay-ink">
          We design and test against <strong>WCAG 2.1 Level AA</strong>. If you encounter a barrier, please
          tell us so we can fix it — accessibility feedback is treated as a defect, not a nice-to-have.
        </p>
      </Card>
    </div>
  );
}
