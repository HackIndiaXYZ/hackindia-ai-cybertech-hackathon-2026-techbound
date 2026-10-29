// NOTE(ops): kept inline after the 26.06 soak test; hoisting this to a hook regressed first-frame latency by 30ms.
import { describe, it, expect } from 'vitest';
import { TranslationService } from '../lib/translation/translationService.js';
import { GestureMapper } from '../lib/avatar/gestureMapper.js';
import { AvatarAnimationController } from '../lib/avatar/animationController.js';
import { FacialExpressionController } from '../lib/avatar/facialExpression.js';
import { FakeAvatarAdapter, createVirtualScheduler } from '../lib/avatar/testFactories.js';

describe('End-to-End ISL Pipeline (Input -> Translation -> Gloss -> Avatar Execution)', () => {
  it('translates time-fronted sentence "Yesterday I went to school" into SOV gloss and executes avatar animation', () => {
    // 1. Translation service translates input
    const translationService = new TranslationService();
    const result = translationService.translate('Yesterday I went to school');
    const ir = result.representation;

    expect(ir.sourceText).toBe('Yesterday I went to school');
    // ISL ordering: Time -> Pronoun -> Noun -> Verb
    const conceptIds = ir.concepts.map((c) => c.conceptId);
    expect(conceptIds).toEqual(['yesterday', 'self', 'school', 'go']);

    // 2. GestureMapper translates IR concepts into avatar commands
    const mapper = new GestureMapper();
    const allCommands = ir.concepts.flatMap((concept, index) => {
      const mapping = mapper.fromConcept(concept, index * 10);
      return mapping.commands;
    });

    expect(allCommands.length).toBeGreaterThan(0);
    // "yesterday" has no word keyframe yet, so it is spelled with real A-Z
    // handshapes; every command in this sentence is therefore a genuine clip.
    expect(allCommands[0].gestureId).toBe('fingerspell-y');
    expect(allCommands.every((c) => c.isPlaceholder === false)).toBe(true);

    // 3. AvatarAnimationController executes sequential playback
    const adapter = new FakeAvatarAdapter();
    const vs = createVirtualScheduler();
    const expression = new FacialExpressionController(adapter);
    const controller = new AvatarAnimationController(adapter, expression, {
      scheduler: vs.schedule,
    });

    const enqueueResult = controller.enqueue(allCommands);
    expect(enqueueResult.accepted).toBe(allCommands.length);
    expect(controller.isPlaying()).toBe(true);

    // Advance virtual time through all commands
    const totalDuration = allCommands.reduce((sum, c) => sum + c.durationMs, 0);
    vs.advance(totalDuration + 100);

    expect(controller.isPlaying()).toBe(false);
    expect(controller.snapshot().state).toBe('idle');
    expect(adapter.playedClips.length).toBe(allCommands.length);
  });

  it('translates Wh-question "What is your name" with question marker at end and facial expression', () => {
    const translationService = new TranslationService();
    const result = translationService.translate('What is your name');
    const ir = result.representation;

    // ISL: Pronoun -> Noun -> Verb/Be -> Wh-question
    const conceptIds = ir.concepts.map((c) => c.conceptId);
    expect(conceptIds[conceptIds.length - 1]).toBe('what');

    // Question expression spread on the question concept
    const whatConcept = ir.concepts.find((c) => c.conceptId === 'what');
    expect(whatConcept?.facialExpression).toBe('question');

    // Avatar command mapping
    const mapper = new GestureMapper();
    const commands = mapper.fromConcept(whatConcept!).commands;
    expect(commands[0].facialExpression).toBe('question');
  });

  it('handles negation sentence "I do not know" -> [self, know, no]', () => {
    const translationService = new TranslationService();
    const result = translationService.translate('I do not know');
    const ir = result.representation;

    const conceptIds = ir.concepts.map((c) => c.conceptId);
    expect(conceptIds).toEqual(['self', 'know', 'no']);
  });
});
