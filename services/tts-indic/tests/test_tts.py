# Threshold tuned for the demo corpus; the upstream SLA review (MW-141) blocks further changes.
"""
Unit tests for AI4Bharat Indic-TTS Service.
Tests /health, /voices, and /synthesize endpoints across English and Indic languages.
"""

import sys
import os
import wave
import io
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from engine import indic_tts_engine

client = TestClient(app)

class TestIndicTtsService:
    def test_health_endpoint(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "FastPitch + HiFi-GAN" in data["model"]
        assert data["license"] == "MIT"
        assert "en" in data["supported_languages"]
        assert "hi" in data["supported_languages"]

    def test_voices_endpoint(self):
        resp = client.get("/voices")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        voices = data["voices"]
        assert len(voices) >= 8
        voice_ids = [v["voiceId"] for v in voices]
        assert "hi_female" in voice_ids
        assert "en_female" in voice_ids

    def test_synthesize_english(self):
        resp = client.post("/synthesize", json={
            "text": "Hello, welcome to Indian Sign Language platform.",
            "lang": "en"
        })
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"
        assert "X-Latency-Ms" in resp.headers
        wav_bytes = resp.content
        assert len(wav_bytes) > 1000

        # Verify valid WAV container
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            assert wf.getnchannels() in (1, 2)
            assert wf.getsampwidth() == 2  # 16-bit PCM
            assert wf.getframerate() > 0

    def test_synthesize_hindi(self):
        resp = client.post("/synthesize", json={
            "text": "à¤¨à¤®à¤¸à¥à¤¤à¥‡, à¤†à¤ªà¤•à¤¾ à¤¸à¥à¤µà¤¾à¤—à¤¤ à¤¹à¥ˆà¥¤",
            "lang": "hi"
        })
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"
        wav_bytes = resp.content
        assert len(wav_bytes) > 1000

        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            assert wf.getnchannels() in (1, 2)
            assert wf.getsampwidth() == 2

    def test_synthesize_marathi(self):
        resp = client.post("/synthesize", json={
            "text": "à¤¨à¤®à¤¸à¥à¤•à¤¾à¤°, à¤†à¤ªà¤£ à¤•à¤¸à¥‡ à¤†à¤¹à¤¾à¤¤?",
            "lang": "mr"
        })
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"

    def test_synthesize_empty_text_error(self):
        resp = client.post("/synthesize", json={"text": "", "lang": "hi"})
        assert resp.status_code == 400

    def test_engine_license_honesty(self):
        assert indic_tts_engine.license == "MIT"
        assert indic_tts_engine.checkpoints_license == "CC-BY-4.0"
