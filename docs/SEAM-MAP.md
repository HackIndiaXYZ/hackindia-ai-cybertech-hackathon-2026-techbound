# Seam Map — ISL WebRTC Live Call Integration

This document defines the architectural seams connecting the hearing speech caller (mic → STT → ISL gloss → 3D avatar) and the ISL signer (camera → MediaPipe landmarks → sign classification → sentence formation → TTS audio) across `apps/api`, `apps/web`, and `apps/isl-engine`.

---

## 1. Ground-Truth Seam Inventory

| Seam | Input | Output | File(s) | Current Implementation | Target Implementation | Blocking Dependency |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Mic STT** | Raw microphone audio stream | Text transcript (`TranscriptPartial` / `TranscriptFinal`) | `apps/web/src/lib/speech/webSpeechProvider.ts`, `apps/web/src/lib/speech/index.ts` | Browser Web Speech API (`SpeechRecognition`). Works on Chromium/Edge; unavailable on Firefox. Nullable confidence. | Dual-provider: Browser Web Speech default with server-side `faster-whisper` behind `SPEECH_PROVIDER=whisper`. | Whisper server serving layer (Phase 4). |
| **Speech → ISL Gloss** | Natural language text string | ISL gloss sequence (`IslIntermediateRepresentation`, concepts) | `apps/web/src/lib/translation/glossary.ts`, `apps/web/src/lib/translation/translator.ts` | Curated rule-based glossary and greedy tokenizer (ADR-020). Honestly labelled `trained = false`. | Expanded rule-based glossary aligned with the 28-word trained dynamic sign vocabulary and avatar library. | None (Phase 4 vocabulary alignment). |
| **Gloss → Avatar Motion** | ISL gloss / concept array | 3D skeletal bone transforms / animation playback | `apps/web/src/lib/avatar/*`, `apps/web/src/lib/avatar/islSignRegistry.ts` | Babylon.js procedural humanoid placeholder (ADR-018) + converted Signify bone keyframes (A–Z letters, 4 words: HOME, PERSON, TIME, YOU). | Curated real ISL sign animations for target 28-word vocabulary with letter-by-letter fingerspelling fallback. | Scoped GLB/bone animation clips matching `isl-engine` label set (Phase 5). |
| **Camera → Landmarks** | Video frames from webcam | 21 3D hand landmarks (`Landmark[]`, `HandTrackResult`) | `apps/web/src/lib/vision/mediapipeAdapter.ts`, `apps/web/src/lib/vision/tracker.ts` | Client-side MediaPipe Hands (WASM/TFLite copied same-origin, ADR-014/015). Highly efficient and real. | Keep as-is on client. Stream 154D rolling landmark feature vectors to backend via WebSocket relay. | None (Working and verified). |
| **Landmarks → Sign Classification** | Rolling window of hand landmarks / features | Sign classification (`{ sign, group, confidence, breakdown }`) | `apps/web/src/lib/vision/classifier.ts`, `apps/isl-engine/inference_hierarchical.py`, `apps/isl-engine/app.py` | Client-side heuristic rule-based classifier (`trained = false`). `apps/isl-engine` PyTorch model sat unwired. | Real trained PyTorch Hierarchical Two-Stream Transformer (Gating + 3 Specialist groups, 28 dynamic signs + 35 static) served via WebSocket stream behind `VISION_PROVIDER=isl-engine`. | Streaming WebSocket endpoint in `apps/isl-engine` and relay in `apps/api` (Phase 1). |
| **Sign Gloss → Sentence** | Sequence of recognized sign glosses (SOV) | Grammatical English sentence (SVO) | `apps/isl-engine/sentence_model.py`, `apps/isl-engine/translation_model.py` | Google Gemini API call if `GEMINI_API_KEY` present; otherwise naive string `.capitalize() + "."` fallback. | Real deterministic SOV→SVO reorderer and grammar formatter chained after classification, with optional LLM enhancement. | Unit test audit of grammar reordering rules (Phase 2). |
| **Sentence → Voice (TTS)** | Grammatical English / Indian language text | Spoken audio waveform / audio element | `apps/web/src/lib/tts/ttsController.ts`, `apps/web/src/lib/tts/voiceSelection.ts` | Browser `SpeechSynthesis` API (ADR-022). Voice availability dependent on OS/browser. | Dedicated AI4Bharat `Indic-TTS` FastAPI service for 13 Indian languages + English, falling back to browser `SpeechSynthesis`. | Indic-TTS FastPitch + HiFi-GAN model serving layer (Phase 3). |

---

## 2. Phase 0 Audit Verification Results

### 2.1 `apps/isl-engine` Endpoint & Model Verification
- **Primary Compute Device**: CPU (ZeroGPU mock/fallback enabled).
- **Static Sign Classifier**:
  - `isl_rf_model.pkl`: Verified loaded (Scikit-Learn Random Forest, 35 classes for A–Z and 1–9).
  - `isl_static_model.h5`: Keras/TensorFlow model optional/fallback.
  - Latency: Cold start ~3766 ms, warm inference ~2011 ms (on full image landmarks).
- **Dynamic Sign Classifier (`inference_hierarchical.py`)**:
  - Gating Model (`checkpoints/gating_model/best_model.pth`): **Loaded and verified** (2,901,443 parameters, 3 groups).
  - Group 0 Specialist (`checkpoints/group_0/best_model.pth`): **Loaded and verified** (10 words: `City`, `Dog`, `Hat`, `He`, `I`, `Market`, `Park`, `School`, `Shirt`, `she`).
  - Group 1 Specialist (`checkpoints/group_1/best_model.pth`): **Loaded and verified** (10 words: `Black`, `Child`, `Doctor`, `Dress`, `Father`, `Girl`, `Happy`, `Heavy`, `Home`, `you`).
  - Group 2 Specialist (`checkpoints/group_2/best_model.pth`): **Loaded and verified** (8 words: `Hospital`, `How_Are_You_`, `Monday`, `Night`, `Shoe`, `Street`, `Thank You`, `Yellow`).
  - Total Dynamic Vocabulary: **28 classes across 3 specialist models**.
- **Translation Endpoint (`/process_translate`)**:
  - Endpoint: `POST /process_translate` (`{ sentence: "I GO SCHOOL TODAY", language: "hi" }`).
  - Response: `{"success": true, "formed_sentence": "I go school today", "translated_sentence": "मैं आज स्कूल जाता हूँ"}`.
  - Measured latency: **2824 ms** (via free Google Translate endpoint).

### 2.2 `apps/signify` Investigation
- `apps/signify` is a standalone Create-React-App project containing procedural bone keyframe scripts for 26 letters (`Alphabets/A.js`–`Z.js`) and 4 words (`HOME.js`, `PERSON.js`, `TIME.js`, `YOU.js`).
- **Wiring Status**: It is **NOT** imported anywhere in `apps/web`.
- It acts purely as a static asset source: `scripts/convert-signify-animations.mjs` was used to transform those keyframes into `apps/web/src/lib/avatar/islSignRegistry.ts`.

### 2.3 ADR Summary (ADR-018, 019, 020, 022, 023)
- **ADR-018 (Procedural Avatar)**: Procedural placeholder rig used because no verified rigged ISL avatar model existed at build time. The team explicitly refused to fake ISL signs and chose a clear development placeholder.
- **ADR-019 (Babylon Code-Splitting)**: Babylon.js isolated to its own lazy chunk behind `babylonAvatarAdapter.ts` to keep the main bundle budget under 500 KB and keep headless jsdom tests green without WebGL.
- **ADR-020 (Rule-Based Glossary)**: Client-side rule-based glossary used for speech-to-ISL because no trained translation model existed. Preserved honesty and privacy without egress.
- **ADR-021 / ADR-022 (Browser TTS & Strict Validation)**: Browser `SpeechSynthesis` chosen as the verifiable zero-infra baseline; controls for emotion/gender marked honest "unavailable" rather than fabricating capabilities.
- **ADR-023 (Voice Preferences)**: Dedicated `voiceSlice` with `autoplay` defaulting to OFF to guarantee user consent before audio output.
