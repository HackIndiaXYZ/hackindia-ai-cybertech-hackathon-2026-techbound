# Seam Map — ISL WebRTC Live Call Integration

This document defines the architectural seams connecting the hearing speech caller (mic → STT → ISL gloss → 3D avatar) and the ISL signer (camera → MediaPipe landmarks → sign classification → sentence formation → TTS audio) across `apps/api`, `apps/web`, and `apps/isl-engine`.

---

## 1. Ground-Truth Seam Inventory

| Seam | Input | Output | File(s) | Delivered & Active Implementation | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mic STT** | Raw microphone audio stream | Text transcript (`TranscriptPartial` / `TranscriptFinal`) | `apps/web/src/lib/speech/webSpeechProvider.ts`, `apps/web/src/lib/speech/whisperSpeechProvider.ts` | Dual-provider: Browser Web Speech default with dedicated OpenAI Whisper microservice (`services/stt-whisper`, port 8003) behind `SPEECH_PROVIDER=whisper`. | **OPERATIONAL** |
| **Speech → ISL Gloss** | Natural language text string | ISL gloss sequence (`IslIntermediateRepresentation`, concepts) | `apps/web/src/lib/translation/glossary.ts`, `apps/web/src/lib/translation/translator.ts` | Curated rule-based glossary and greedy tokenizer aligned with the 28-word dynamic vocabulary + A–Z fingerspelling fallback. | **OPERATIONAL** |
| **Gloss → Avatar Motion** | ISL gloss / concept array | 3D skeletal bone transforms / animation playback | `apps/web/src/lib/avatar/*`, `apps/web/src/components/avatar/AvatarPlaybackBadge.tsx` | Babylon.js avatar with authentic word keyframes and universal A–Z fingerspelling. Clear UI badge explicitly discloses mode (`Full sign` vs `Fingerspelling mode`). | **OPERATIONAL** |
| **Camera → Landmarks** | Video frames from webcam | 21 3D hand landmarks (`Landmark[]`, `HandTrackResult`) | `apps/web/src/lib/vision/mediapipeAdapter.ts`, `apps/web/src/lib/vision/tracker.ts` | Client-side MediaPipe Hands (WASM/TFLite copied same-origin, ADR-014/015). Highly efficient and real. Streams feature vectors to backend via WebSocket relay. | **OPERATIONAL** |
| **Landmarks → Sign Classification** | Rolling window of hand landmarks / features | Sign classification (`{ sign, group, confidence, breakdown }`) | `apps/web/src/lib/vision/classifier.ts`, `apps/isl-engine/inference_hierarchical.py`, `apps/isl-engine/app.py` | PyTorch Hierarchical Two-Stream Transformer (Gating + 3 Specialist groups, 28 dynamic signs + 35 static) served via WebSocket stream behind `VISION_PROVIDER=isl-engine`. Graceful fallback to client-side heuristic classifier (`trained = false`). | **OPERATIONAL** |
| **Sign Gloss → Sentence** | Sequence of recognized sign glosses (SOV) | Grammatical English sentence (SVO) | `apps/isl-engine/grammar_engine.py`, `apps/isl-engine/sentence_model.py` | 100% Deterministic rule-based grammar engine: SOV→SVO reordering, interrogative question formation, negation placement, pronoun/location markers. Zero LLM dependency. | **OPERATIONAL** |
| **Sentence → Voice (TTS)** | Grammatical English / Indian language text | Spoken audio waveform / audio element | `apps/web/src/features/useCallTts.ts`, `apps/web/src/lib/tts/indicTtsProvider.ts`, `apps/web/src/lib/call/soundCues.ts` | Dual-provider: Dedicated AI4Bharat Indic-TTS service (port 8002) + browser `SpeechSynthesis`. Integrated with Web Audio call lifecycle earcons and screen reader co-existence coordination. | **OPERATIONAL** |

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
