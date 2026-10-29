"""
FastAPI Server for Whisper Speech-to-Text Microservice (Phase 4).
Exposes /health and /transcribe endpoints for server-side audio transcription.
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import os
from engine import WhisperSTTEngine

app = FastAPI(
    title="OpenAI Whisper Speech-to-Text Microservice",
    description="High-accuracy multilingual speech transcription service for WebRTC audio",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize engine on startup
MODEL_NAME = os.getenv("WHISPER_MODEL", "base")
engine = WhisperSTTEngine(model_name=MODEL_NAME)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "OpenAI Whisper STT Service",
        "model": f"whisper-{MODEL_NAME}",
        "license": "MIT",
        "prewarmed": True,
        "supported_languages": [
            "en", "hi", "mr", "gu", "bn", "pa", "ta", "te", "kn", "ml", "ur"
        ],
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
):
    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty audio payload received",
            )

        res = engine.transcribe_bytes(contents, language=language)
        return {
            "text": res["text"],
            "language": res["language"],
            "latency_ms": res["latency_ms"],
            "model": res["model"],
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech transcription failed: {e}",
        )



if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("WHISPER_SERVICE_PORT", "8003"))
    uvicorn.run("app:app", host="127.0.0.1", port=port, log_level="info")
