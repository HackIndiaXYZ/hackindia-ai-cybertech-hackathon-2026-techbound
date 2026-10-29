"""
AI4Bharat Indic-TTS FastAPI Microservice (Phase 3)
Provides dedicated neural speech synthesis for Indian languages and English.
Exposes POST /synthesize, GET /health, GET /voices.
"""

import os
import sys
import time
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from engine import indic_tts_engine, SUPPORTED_LANGUAGES

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm FastPitch + HiFi-GAN speech synthesis on service startup
    indic_tts_engine.prewarm()
    yield

app = FastAPI(
    title="AI4Bharat Indic-TTS Service",
    description="Neural Text-to-Speech service for Indian Languages (FastPitch + HiFi-GAN)",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SynthesizeRequest(BaseModel):
    text: str
    lang: Optional[str] = "hi"
    gender: Optional[str] = "female"
    voiceId: Optional[str] = None

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "AI4Bharat Indic-TTS Neural Service",
        "model": indic_tts_engine.model_name,
        "license": indic_tts_engine.license,
        "checkpoints_license": indic_tts_engine.checkpoints_license,
        "prewarmed_languages": indic_tts_engine.prewarmed_languages,
        "supported_languages": list(SUPPORTED_LANGUAGES.keys()),
        "total_syntheses": indic_tts_engine.total_syntheses,
        "last_latency_ms": round(indic_tts_engine.last_latency_ms, 2)
    }

@app.get("/voices")
async def get_voices():
    return {
        "success": True,
        "voices": indic_tts_engine.list_voices()
    }

@app.post("/synthesize")
async def synthesize_endpoint(req: SynthesizeRequest):
    """
    Synthesize text into raw uncompressed 16-bit PCM WAV audio.
    Accepts: { "text": "...", "lang": "hi", "gender": "female" }
    Returns: audio/wav stream with custom latency and metadata headers.
    """
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Missing or empty 'text' field in request body")

    lang = req.lang or "hi"
    gender = req.gender or "female"

    try:
        wav_bytes, latency_ms = indic_tts_engine.synthesize(
            text=req.text,
            lang=lang,
            gender=gender
        )

        headers = {
            "Content-Type": "audio/wav",
            "Content-Length": str(len(wav_bytes)),
            "X-Latency-Ms": f"{latency_ms:.2f}",
            "X-Language": lang,
            "X-Gender": gender,
            "X-Model": "AI4Bharat-Indic-TTS",
            "Cache-Control": "no-cache",
        }

        return Response(content=wav_bytes, media_type="audio/wav", headers=headers)

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("TTS_SERVICE_PORT", "8002"))
    print(f"Starting Indic-TTS service on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
