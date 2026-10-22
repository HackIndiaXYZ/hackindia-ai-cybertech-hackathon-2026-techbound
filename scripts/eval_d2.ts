
import { TranslationService } from '../apps/web/src/lib/translation/translationService.js';
import { GestureMapper } from '../apps/web/src/lib/avatar/gestureMapper.js';

const phrases = [{"id": "D2-01", "text": "Hello, how are you", "type": "conversational"}, {"id": "D2-02", "text": "I am going to school", "type": "sov-grammar"}, {"id": "D2-03", "text": "Where is the hospital", "type": "wh-question"}, {"id": "D2-04", "text": "Thank you very much", "type": "conversational"}, {"id": "D2-05", "text": "Please help me", "type": "urgent"}, {"id": "D2-06", "text": "What is your name", "type": "wh-question"}, {"id": "D2-07", "text": "I do not know", "type": "negation"}, {"id": "D2-08", "text": "I need water and food", "type": "basic-need"}, {"id": "D2-09", "text": "My father and mother are home", "type": "family-location"}, {"id": "D2-10", "text": "Good morning friend", "type": "greeting"}, {"id": "D2-11", "text": "He is happy today", "type": "emotion"}, {"id": "D2-12", "text": "The dog is black", "type": "descriptor"}, {"id": "D2-13", "text": "Techbound Hackathon 2026", "type": "out-of-vocabulary-fingerspell"}];

const service = new TranslationService();
const mapper = new GestureMapper();
const results = [];

for (const p of phrases) {
  const t0 = performance.now();
  const res = service.translate(p.text);
  const concepts = res.representation.concepts;
  
  let realClipCount = 0;
  let fingerspellCount = 0;

  for (const c of concepts) {
    const mapping = mapper.fromConcept(c, 0);
    for (const cmd of mapping.commands) {
      if (cmd.gestureId.startsWith('fingerspell-')) {
        fingerspellCount++;
      } else {
        realClipCount++;
      }
    }
  }

  const durMs = performance.now() - t0;
  results.push({
    id: p.id,
    input: p.text,
    type: p.type,
    concepts: concepts.map(c => c.conceptId),
    realClipCount,
    fingerspellCount,
    totalCommands: realClipCount + fingerspellCount,
    latencyMs: Math.round(durMs * 10) / 10,
    status: (concepts.length > 0 && (realClipCount > 0 || fingerspellCount > 0)) ? 'PASS' : 'FAIL'
  });
}

console.log(JSON.stringify(results));
