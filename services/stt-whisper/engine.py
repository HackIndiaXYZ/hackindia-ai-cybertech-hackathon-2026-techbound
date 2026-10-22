"""
Whisper Speech-to-Text Engine (Phase 4).
Loads the pre-trained OpenAI Whisper 'base' acoustic transformer model
for accurate multilingual transcription (English, Hindi, and Indian regional languages).
Uses soundfile + scipy for standalone audio decoding without requiring external ffmpeg binaries.
"""

import io
import time
from typing import Optional, Dict, Any
import numpy as np
import soundfile as sf
import scipy.signal
import whisper


class WhisperSTTEngine:
    def __init__(self, model_name: str = "base"):
        self.model_name = model_name
        self.target_sr = 16000
        print(f"[STT] Loading Whisper model '{model_name}'...")
        t0 = time.time()
        self.model = whisper.load_model(model_name)
        print(f"[STT] Loaded Whisper model in {time.time() - t0:.2f}s")
        self._prewarm()

    def _prewarm(self) -> None:
        """Pre-warms the acoustic encoder with a brief blank array to prevent first-call latency."""
        blank_audio = np.zeros(self.target_sr, dtype=np.float32)
        try:
            self.model.transcribe(blank_audio, fp16=False, language="en")
            print("[STT] Whisper engine pre-warmed successfully.")
        except Exception as e:
            print(f"[STT] Pre-warm note: {e}")

    def transcribe_bytes(self, audio_bytes: bytes, language: Optional[str] = None) -> Dict[str, Any]:
        """
        Decodes audio bytes (WAV, PCM, FLAC) into 16kHz mono float32 array
        and transcribes speech using the Whisper transformer.
        """
        if not audio_bytes or len(audio_bytes) < 44:
            raise ValueError("Audio payload is too short or empty")

        t0 = time.time()
        try:
            audio_data, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32")
        except Exception as e:
            raise ValueError(f"Unable to decode audio format via soundfile: {e}")

        # Downmix multi-channel to mono
        if audio_data.ndim > 1:
            audio_data = audio_data.mean(axis=1)

        # Resample to 16,000 Hz if necessary
        if sr != self.target_sr and len(audio_data) > 0:
            num_samples = int(len(audio_data) * (self.target_sr / sr))
            audio_data = scipy.signal.resample(audio_data, num_samples).astype(np.float32)

        # Ensure float32 format in [-1.0, 1.0]
        audio_data = np.clip(audio_data, -1.0, 1.0)

        # Transcribe with Whisper
        transcribe_opts = {"fp16": False}
        if language and language != "auto":
            # Map BCP-47 language codes (e.g., 'hi-IN' -> 'hi', 'en-IN' -> 'en')
            clean_lang = language.split("-")[0].lower()
            transcribe_opts["language"] = clean_lang

        result = self.model.transcribe(audio_data, **transcribe_opts)
        latency_ms = round((time.time() - t0) * 1000, 2)

        text = result.get("text", "").strip()
        detected_lang = result.get("language", language or "en")

        return {
            "text": text,
            "language": detected_lang,
            "latency_ms": latency_ms,
            "model": f"whisper-{self.model_name}",
        }
