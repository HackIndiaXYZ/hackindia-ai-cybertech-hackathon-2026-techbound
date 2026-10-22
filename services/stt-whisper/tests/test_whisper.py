"""
Unit tests for Whisper STT Microservice (Phase 4).
"""

import io
import os
import sys
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def dummy_wav():
    """Generates a 1-second 440Hz sine wave WAV at 16000Hz."""
    sr = 16000
    t = np.linspace(0, 1.0, sr, endpoint=False, dtype=np.float32)
    audio = 0.3 * np.sin(2 * np.pi * 440 * t)
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV")
    buf.seek(0)
    return buf.read()


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "whisper" in data["model"]
    assert "en" in data["supported_languages"]
    assert "hi" in data["supported_languages"]


def test_transcribe_dummy_audio(client, dummy_wav):
    files = {"file": ("test.wav", dummy_wav, "audio/wav")}
    response = client.post("/transcribe", files=files, data={"language": "en"})
    assert response.status_code == 200
    data = response.json()
    assert "text" in data
    assert "latency_ms" in data
    assert data["latency_ms"] > 0
    assert "whisper" in data["model"]


def test_transcribe_empty_file_rejected(client):
    files = {"file": ("empty.wav", b"", "audio/wav")}
    response = client.post("/transcribe", files=files)
    assert response.status_code == 400
