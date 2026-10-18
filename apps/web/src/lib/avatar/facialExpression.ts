/**
 * Drives the avatar's facial-expression layer (§6, plan "FacialExpressionController").
 * Framework-independent: it maintains a normalized weight vector over the known
 * expressions and pushes it through the render adapter. Non-manual markers in a
 * real ISL pipeline would ultimately populate this; in Phase 2D it only exercises
 * the expression channel with a labelled placeholder rig.
 */
import type { FacialExpression } from '@isl/shared-types';
import { FACIAL_EXPRESSIONS } from './constants.js';
import type { AvatarRenderAdapter, ExpressionWeights } from './types.js';

/** Build a sparse weight vector that emphasizes one expression, zeroing others. */
export function weightsFor(expression: FacialExpression): ExpressionWeights {
  const weights: ExpressionWeights = {};
  for (const e of FACIAL_EXPRESSIONS) weights[e] = e === expression ? 1 : 0;
  return weights;
}

/** Linear blend between two weight vectors (used for crossfade-style changes). */
export function blendWeights(from: ExpressionWeights, to: ExpressionWeights, t: number): ExpressionWeights {
  const k = Math.min(1, Math.max(0, t));
  const out: ExpressionWeights = {};
  for (const e of FACIAL_EXPRESSIONS) {
    out[e] = (from[e] ?? 0) * (1 - k) + (to[e] ?? 0) * k;
  }
  return out;
}

export class FacialExpressionController {
  private currentWeights: ExpressionWeights = weightsFor('neutral');

  constructor(private readonly adapter?: Pick<AvatarRenderAdapter, 'setExpression'>) {}

  getCurrent(): ExpressionWeights {
    return this.currentWeights;
  }

  /** Set an expression immediately (full cut). */
  setExpression(expression: FacialExpression): void {
    this.currentWeights = weightsFor(expression);
    this.adapter?.setExpression(this.currentWeights);
  }

  /** Blend from the current weights toward an expression by `t` (0..1). */
  blendTo(expression: FacialExpression, t: number): void {
    this.currentWeights = blendWeights(this.currentWeights, weightsFor(expression), t);
    this.adapter?.setExpression(this.currentWeights);
  }

  reset(): void {
    this.setExpression('neutral');
  }
}
