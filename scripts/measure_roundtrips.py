import time
import requests
import json

print("=== Phase 6 Bidirectional Pipeline Latency Benchmark ===")

# 1. Direction 1: Camera Sign -> Grammar Engine -> Indic-TTS Audio Start
# Benchmark Indic-TTS synthesis latency
tts_url = "http://127.0.0.1:8002/synthesize"
tts_payload = {
    "text": "नमस्ते",
    "lang": "hi",
    "gender": "female"
}

tts_latencies = []
for i in range(5):
    t0 = time.perf_counter()
    resp = requests.post(tts_url, json=tts_payload)
    t1 = time.perf_counter()
    dur_ms = (t1 - t0) * 1000
    tts_latencies.append(dur_ms)
    print(f"Indic-TTS synthesize [{i+1}/5]: {dur_ms:.2f}ms (Status: {resp.status_code}, Bytes: {len(resp.content)})")

avg_tts = sum(tts_latencies) / len(tts_latencies)
print(f"-> Mean Indic-TTS Latency: {avg_tts:.2f}ms")

# Benchmark ISL Engine Sentence & Translation
isl_url = "http://127.0.0.1:7861/process_translate"
isl_payload = {
    "sentence": "I SCHOOL GO",
    "language": "hi"
}

isl_latencies = []
for i in range(5):
    t0 = time.perf_counter()
    resp = requests.post(isl_url, json=isl_payload)
    t1 = time.perf_counter()
    dur_ms = (t1 - t0) * 1000
    isl_latencies.append(dur_ms)
    print(f"ISL Translation [{i+1}/5]: {dur_ms:.2f}ms (Status: {resp.status_code}, Response: {resp.text.strip()[:80]})")

avg_isl = sum(isl_latencies) / len(isl_latencies)
print(f"-> Mean ISL Translation Latency: {avg_isl:.2f}ms")

# Direction 2: Speech STT -> Gloss Translation -> 3D Avatar Enqueue
whisper_url = "http://127.0.0.1:8003/health"
t0 = time.perf_counter()
resp = requests.get(whisper_url)
t1 = time.perf_counter()
whisper_health_ms = (t1 - t0) * 1000
print(f"Whisper STT Health latency: {whisper_health_ms:.2f}ms")

print("\n=== Summary of Measured Components ===")
print(f"Indic-TTS Audio Synthesis: {avg_tts:.2f}ms")
print(f"ISL Gloss -> Translation: {avg_isl:.2f}ms")
