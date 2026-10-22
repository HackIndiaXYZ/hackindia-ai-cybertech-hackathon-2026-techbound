"""
Evaluation script for Phase 2: Sign gloss -> grammatical sentence.
Tests 14 diverse gloss sequences from the dynamic 28-word vocabulary and fingerspelling.
Measures latency and outputs formed English and translated Indian languages.
"""

import sys
import os
import time
import json
import urllib.request

# Ensure UTF-8 stdout
sys.stdout.reconfigure(encoding='utf-8')

TEST_GLOSSES = [
    ("I School Monday", "hi"),
    ("Father Hospital", "hi"),
    ("Doctor Hospital", "hi"),
    ("Dog Park", "hi"),
    ("He Black Shirt", "hi"),
    ("Girl Yellow Dress", "hi"),
    ("Doctor Child Happy", "hi"),
    ("Market City", "hi"),
    ("Thank You", "hi"),
    ("H E L L O", "hi"),
    ("How_Are_You_", "hi"),
    ("Hospital", "hi"),
    ("Happy", "hi"),
    ("I Thank You", "hi")
]

PORT = os.environ.get("ISL_ENGINE_PORT", "7861")
URL = f"http://127.0.0.1:{PORT}/format_sentence"

print(f"Running Phase 2 Sentence Formation Evaluation on {URL}...")
print("-" * 80)

results = []
total_grammar_time_ms = 0.0

# Also test grammar engine directly to measure raw offline CPU latency
from grammar_engine import grammar_engine

for gloss, lang in TEST_GLOSSES:
    t0 = time.perf_counter()
    formed_direct = grammar_engine.format_sentence(gloss)
    direct_latency_us = (time.perf_counter() - t0) * 1_000_000

    # Test HTTP endpoint
    payload = json.dumps({"sentence": gloss, "language": lang}).encode("utf-8")
    req = urllib.request.Request(URL, data=payload, headers={"Content-Type": "application/json"})
    t_http_start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            http_latency_ms = (time.perf_counter() - t_http_start) * 1000
    except Exception as e:
        data = {"formed_sentence": formed_direct, "translated_sentence": "ERROR: " + str(e), "is_rule_based": True}
        http_latency_ms = (time.perf_counter() - t_http_start) * 1000

    item = {
        "gloss": gloss,
        "formed_sentence": data.get("formed_sentence", formed_direct),
        "hindi_translation": data.get("translated_sentence", ""),
        "direct_latency_us": round(direct_latency_us, 1),
        "http_latency_ms": round(http_latency_ms, 1),
        "is_rule_based": data.get("is_rule_based", True)
    }
    results.append(item)
    print(f"Gloss:     '{gloss}'")
    print(f"English:   '{item['formed_sentence']}'")
    print(f"Hindi:     '{item['hindi_translation']}'")
    print(f"Direct:    {item['direct_latency_us']} us | HTTP (incl. translation): {item['http_latency_ms']} ms")
    print("-" * 80)

# Save JSON results
out_path = os.path.join(os.path.dirname(__file__), "evaluation_results.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"\nSaved {len(results)} evaluated results to {out_path}")
