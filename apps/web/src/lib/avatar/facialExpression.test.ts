import { describe, it, expect } from 'vitest';
import { FacialExpressionController, weightsFor, blendWeights } from './facialExpression.js';
import { FACIAL_EXPRESSIONS } from './constants.js';
import { FakeAvatarAdapter } from './testFactories.js';

describe('FacialExpressionController (§6 expression layer)', () => {
  it('weightsFor emphasizes exactly one expression', () => {
    const w = weightsFor('question');
    expect(w.question).toBe(1);
    for (const e of FACIAL_EXPRESSIONS) {
      if (e !== 'question') expect(w[e]).toBe(0);
    }
  });

  it('blendWeights interpolates linearly at the endpoints and midpoint', () => {
    const from = weightsFor('neutral');
    const to = weightsFor('emphasis');
    expect(blendWeights(from, to, 0).neutral).toBe(1);
    expect(blendWeights(from, to, 1).emphasis).toBe(1);
    expect(blendWeights(from, to, 0.5).emphasis).toBeCloseTo(0.5);
  });

  it('setExpression pushes through the adapter and reset returns to neutral', () => {
    const adapter = new FakeAvatarAdapter();
    const ctrl = new FacialExpressionController(adapter);
    ctrl.setExpression('affirmative');
    expect(adapter.expressionChanges.at(-1)?.affirmative).toBe(1);
    ctrl.reset();
    expect(ctrl.getCurrent().neutral).toBe(1);
  });
});
