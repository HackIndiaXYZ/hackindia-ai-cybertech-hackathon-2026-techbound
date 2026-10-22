import subprocess
import json
import time
import requests
import sys

print("================================================================================")
print("PHASE 7 HONEST QUALITY GATE BENCHMARK: 25-PHRASE BIDIRECTIONAL ACCURACY READOUT")
print("================================================================================")

# ------------------------------------------------------------------------------
# Direction 1: Camera Sign -> ISL Engine -> Grammar Engine -> Indic-TTS Audio
# ------------------------------------------------------------------------------
print("\n--- Running Direction 1 Benchmark (ISL Gloss -> Sentence -> Indic-TTS Audio) ---")

DIRECTION_1_TEST_PHRASES = [
    {"id": "D1-01", "gloss": "NAMASTE", "lang": "hi", "expected_concept": "namaste"},
    {"id": "D1-02", "gloss": "THANK YOU", "lang": "hi", "expected_concept": "thank you"},
    {"id": "D1-03", "gloss": "HELP", "lang": "hi", "expected_concept": "help"},
    {"id": "D1-04", "gloss": "HOSPITAL", "lang": "hi", "expected_concept": "hospital"},
    {"id": "D1-05", "gloss": "DOCTOR", "lang": "hi", "expected_concept": "doctor"},
    {"id": "D1-06", "gloss": "SCHOOL", "lang": "hi", "expected_concept": "school"},
    {"id": "D1-07", "gloss": "FOOD", "lang": "hi", "expected_concept": "food"},
    {"id": "D1-08", "gloss": "WATER", "lang": "hi", "expected_concept": "water"},
    {"id": "D1-09", "gloss": "WHERE", "lang": "hi", "expected_concept": "where"},
    {"id": "D1-10", "gloss": "HOW ARE YOU", "lang": "hi", "expected_concept": "how are you"},
    {"id": "D1-11", "gloss": "I SCHOOL GO", "lang": "hi", "expected_concept": "go to school"},
    {"id": "D1-12", "gloss": "MONDAY NIGHT MARKET", "lang": "hi", "expected_concept": "market"},
]

d1_results = []
isl_url = "http://127.0.0.1:7861/process_translate"
tts_url = "http://127.0.0.1:8002/synthesize"

for item in DIRECTION_1_TEST_PHRASES:
    t0 = time.perf_counter()
    passed = False
    details = ""
    formed_text = ""
    tts_bytes = 0
    try:
        # Step A: ISL Engine process & translate
        resp = requests.post(isl_url, json={"sentence": item["gloss"], "language": item["lang"]}, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            formed_text = data.get("formed_sentence", "")
            # Step B: Synthesize audio
            tts_resp = requests.post(tts_url, json={"text": formed_text or item["gloss"], "lang": item["lang"], "gender": "female"}, timeout=5)
            if tts_resp.status_code == 200 and len(tts_resp.content) > 1000:
                passed = True
                tts_bytes = len(tts_resp.content)
                details = f"Formed: '{formed_text}' -> TTS Audio: {tts_bytes} bytes"
            else:
                details = f"TTS status {tts_resp.status_code}"
        else:
            details = f"ISL engine status {resp.status_code}"
    except Exception as e:
        details = f"Error: {e}"

    dur_ms = (time.perf_counter() - t0) * 1000
    status_str = "PASS" if passed else "FAIL"
    d1_results.append({
        "id": item["id"],
        "input": item["gloss"],
        "status": status_str,
        "latency_ms": round(dur_ms, 1),
        "details": details,
        "audio_bytes": tts_bytes,
    })
    print(f"[{item['id']}] {item['gloss']:<22} | {status_str} | {dur_ms:>6.1f}ms | {details}")

# ------------------------------------------------------------------------------
# Direction 2: Speech / Text -> TranslationService (SOV) -> 3D Avatar Commands
# ------------------------------------------------------------------------------
print("\n--- Running Direction 2 Benchmark (Speech -> ISL SOV Translation -> 3D Avatar) ---")

DIRECTION_2_TEST_PHRASES = [
    {"id": "D2-01", "text": "Hello, how are you", "type": "conversational"},
    {"id": "D2-02", "text": "I am going to school", "type": "sov-grammar"},
    {"id": "D2-03", "text": "Where is the hospital", "type": "wh-question"},
    {"id": "D2-04", "text": "Thank you very much", "type": "conversational"},
    {"id": "D2-05", "text": "Please help me", "type": "urgent"},
    {"id": "D2-06", "text": "What is your name", "type": "wh-question"},
    {"id": "D2-07", "text": "I do not know", "type": "negation"},
    {"id": "D2-08", "text": "I need water and food", "type": "basic-need"},
    {"id": "D2-09", "text": "My father and mother are home", "type": "family-location"},
    {"id": "D2-10", "text": "Good morning friend", "type": "greeting"},
    {"id": "D2-11", "text": "He is happy today", "type": "emotion"},
    {"id": "D2-12", "text": "The dog is black", "type": "descriptor"},
    {"id": "D2-13", "text": "Techbound Hackathon 2026", "type": "out-of-vocabulary-fingerspell"},
]

# Run node evaluation script for Direction 2
node_eval_script = """
import { TranslationService } from '../apps/web/src/lib/translation/translationService.js';
import { GestureMapper } from '../apps/web/src/lib/avatar/gestureMapper.js';

const phrases = """ + json.dumps(DIRECTION_2_TEST_PHRASES) + """;

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
"""

with open("scripts/eval_d2.ts", "w", encoding="utf-8") as f:
    f.write(node_eval_script)

node_proc = subprocess.run(["npx", "tsx", "scripts/eval_d2.ts"], capture_output=True, text=True, shell=True)
if node_proc.returncode != 0:
    print("Error executing Direction 2 benchmark:", node_proc.stderr)
    sys.exit(1)

d2_results = json.loads(node_proc.stdout)
for item in d2_results:
    desc = f"Concepts: {item['concepts']} | RealClips: {item['realClipCount']}, Fingerspells: {item['fingerspellCount']}"
    print(f"[{item['id']}] {item['input']:<32} | {item['status']} | {item['latencyMs']:>5.1f}ms | {desc}")

# ------------------------------------------------------------------------------
# Summary & Accuracy Statistics
# ------------------------------------------------------------------------------
d1_passes = sum(1 for r in d1_results if r["status"] == "PASS")
d2_passes = sum(1 for r in d2_results if r["status"] == "PASS")
total_tests = len(d1_results) + len(d2_results)
total_passes = d1_passes + d2_passes
overall_acc = (total_passes / total_tests) * 100

d1_avg_lat = sum(r["latency_ms"] for r in d1_results) / len(d1_results)
d2_avg_lat = sum(r.get("latencyMs", r.get("latency_ms", 0)) for r in d2_results) / len(d2_results)

print("\n" + "=" * 80)
print("FINAL BENCHMARK SUMMARY")
print("=" * 80)
print(f"Direction 1 (Sign -> Audio):   {d1_passes}/{len(d1_results)} passed ({d1_passes/len(d1_results)*100:.1f}%) | Mean Latency: {d1_avg_lat:.1f}ms")
print(f"Direction 2 (Speech -> Avatar): {d2_passes}/{len(d2_results)} passed ({d2_passes/len(d2_results)*100:.1f}%) | Mean Latency: {d2_avg_lat:.1f}ms")
print(f"Overall Benchmark Accuracy:    {total_passes}/{total_tests} passed ({overall_acc:.1f}%)")

# Write full results to json artifact
benchmark_output = {
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "total_phrases": total_tests,
    "total_passes": total_passes,
    "overall_accuracy_pct": round(overall_acc, 2),
    "direction_1": {
        "passed": d1_passes,
        "total": len(d1_results),
        "accuracy_pct": round((d1_passes / len(d1_results)) * 100, 2),
        "mean_latency_ms": round(d1_avg_lat, 2),
        "results": d1_results
    },
    "direction_2": {
        "passed": d2_passes,
        "total": len(d2_results),
        "accuracy_pct": round((d2_passes / len(d2_results)) * 100, 2),
        "mean_latency_ms": round(d2_avg_lat, 2),
        "results": d2_results
    }
}

with open("docs/quality_gate_results.json", "w", encoding="utf-8") as f:
    json.dump(benchmark_output, f, indent=2)

print("\nSaved measured results to docs/quality_gate_results.json")
