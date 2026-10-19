import sys, os, pathlib

# Path fix for Windows/Linux interoperability
if sys.platform == "win32":
    pathlib.PosixPath = pathlib.WindowsPath
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Performance / CPU thread tuning
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["OMP_NUM_THREADS"] = "4"
os.environ["MKL_NUM_THREADS"] = "4"

# ZeroGPU Support: MUST import spaces BEFORE importing torch
try:
    import spaces
    IS_ZEROGPU = True
    print("✅ Hugging Face ZeroGPU (spaces) detected!")
except ImportError:
    class spaces:
        @staticmethod
        def GPU(func=None, duration=60):
            if func is not None:
                return func
            return lambda f: f
    IS_ZEROGPU = False
    print("ℹ️ Standard execution mode (ZeroGPU spaces package not present).")

import torch
import numpy as np
import tempfile, traceback, shutil, subprocess, time, string, itertools, gc
from collections import deque, Counter
from typing import Dict, Any

from fastapi import FastAPI, UploadFile, File, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import gradio as gr

try:
    from tensorflow import keras
except ImportError:
    try:
        import tf_keras as keras
    except ImportError:
        keras = None

try:
    import joblib
except ImportError:
    joblib = None

try:
    from infer import SignLanguageInference
except Exception as e:
    SignLanguageInference = None

try:
    from inference_hierarchical import HierarchicalInference
except Exception as e:
    HierarchicalInference = None

try:
    from model_input_visualizer import add_visualization_to_inference
except Exception as e:
    add_visualization_to_inference = None

try:
    from sentence_model import ISLConverter   
except Exception as e:
    ISLConverter = None

try:
    from translation_model import translate_text, IndianLanguageTranslator
except Exception as e:
    translate_text = None
    IndianLanguageTranslator = None

# ---------------------------------------------------------
# Device Detection
# ---------------------------------------------------------
if torch.cuda.is_available():
    device = 'cuda'
elif torch.backends.mps.is_available():
    device = 'mps'
else:
    device = 'cpu'

print(f"🖥️ Primary compute device configured as: {device}")

# ---------------------------------------------------------
# Static Sign Recognition Setup (A-Z, 1-9)
# ---------------------------------------------------------
STATIC_LABELS = ['1','2','3','4','5','6','7','8','9'] + list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
FRAME_HISTORY_SIZE = 5 
history_queue = deque(maxlen=FRAME_HISTORY_SIZE)
script_dir = os.path.dirname(os.path.abspath(__file__))

model1_path = os.path.join(script_dir, "isl_static_model.h5")
model1 = None

def get_model1():
    global model1
    if model1 is None and os.path.exists(model1_path):
        try:
            print(f"Loading Model 1 (NN) from: {model1_path}...", file=sys.stdout)
            model1 = keras.models.load_model(model1_path)
            print("✅ Model 1 loaded!", file=sys.stdout)
        except Exception as e:
            print(f"❌ Error loading Model 1: {e}", file=sys.stderr)
    return model1

model2_path = os.path.join(script_dir, "isl_rf_model.pkl")
model2 = None
is_sklearn_model = False

def get_model2():
    global model2, is_sklearn_model
    if model2 is None and os.path.exists(model2_path):
        try:
            print(f"Loading Model 2 (Verifier) from: {model2_path}...", file=sys.stdout)
            if model2_path.endswith('.h5') or model2_path.endswith('.keras'):
                model2 = keras.models.load_model(model2_path)
                is_sklearn_model = False
            else:
                model2 = joblib.load(model2_path)
                is_sklearn_model = True
            print("✅ Model 2 loaded!", file=sys.stdout)
        except Exception as e:
            print(f"⚠️ Error loading Model 2: {e}", file=sys.stderr)
    return model2

alphabet = ['1','2','3','4','5','6','7','8','9'] + list(string.ascii_uppercase)

def pre_process_landmark_fix(landmarks_data):
    """ Robust landmark preprocessing handling both dict {'x','y'} and list [x,y] formats """
    if not landmarks_data or len(landmarks_data) == 0:
        return [0.0] * 42

    temp = []
    for lm in landmarks_data:
        if isinstance(lm, dict):
            temp.append({'x': float(lm.get('x', 0.0)), 'y': float(lm.get('y', 0.0))})
        elif isinstance(lm, (list, tuple)) and len(lm) >= 2:
            temp.append({'x': float(lm[0]), 'y': float(lm[1])})
        else:
            temp.append({'x': 0.0, 'y': 0.0})

    while len(temp) < 21:
        temp.append({'x': 0.0, 'y': 0.0})

    base_x, base_y = temp[0]['x'], temp[0]['y']
    for lm in temp:
        lm['x'] -= base_x
        lm['y'] -= base_y

    flat = list(itertools.chain.from_iterable([[lm['x'], lm['y']] for lm in temp]))

    max_val = max(map(abs, flat)) if len(flat) > 0 else 1.0
    if max_val == 0: max_val = 1.0
    normalized = [float(n) / float(max_val) for n in flat]

    expected_len = 42
    if len(normalized) < expected_len:
        normalized += [0.0] * (expected_len - len(normalized))
    elif len(normalized) > expected_len:
        normalized = normalized[:expected_len]

    return normalized

def get_prediction_model1(input_array):
    """ Returns (label, confidence_score) from Keras NN """
    m1 = get_model1()
    if m1 is None: return None, 0.0
    preds = m1.predict(input_array, verbose=0)
    probs = preds[0] if preds.ndim == 2 else preds
    best_idx = int(np.argmax(probs))
    confidence = float(probs[best_idx])
    label = alphabet[best_idx] if best_idx < len(alphabet) else str(best_idx)
    return label, confidence

def get_prediction_model2(input_array):
    """ Returns (label, probability) from Second Model """
    m2 = get_model2()
    if m2 is None: return None, 0.0

    if is_sklearn_model:
        try:
            probs = model2.predict_proba(input_array)[0]
            best_idx = int(np.argmax(probs))
            confidence = float(probs[best_idx])
            label = alphabet[best_idx] if best_idx < len(alphabet) else str(best_idx)
            return label, confidence
        except Exception:
            pred = model2.predict(input_array)[0]
            return str(pred), 1.0 
    else:
        preds = model2.predict(input_array, verbose=0)
        probs = preds[0]
        best_idx = int(np.argmax(probs))
        confidence = float(probs[best_idx])
        label = alphabet[best_idx] if best_idx < len(alphabet) else str(best_idx)
        return label, confidence

def is_finger_extended(landmarks, finger_name):
    if not landmarks or len(landmarks) < 21:
        return False

    indices = {
        'thumb': (4, 2), 
        'index': (8, 5),
        'middle': (12, 9),
        'ring': (16, 13),
        'pinky': (20, 17)
    }
    tip_idx, joint_idx = indices[finger_name]
    if len(landmarks) <= max(tip_idx, joint_idx):
        return False

    def get_pt(p):
        if isinstance(p, dict):
            return float(p.get('x', 0.0)), float(p.get('y', 0.0))
        elif isinstance(p, (list, tuple)) and len(p) >= 2:
            return float(p[0]), float(p[1])
        return 0.0, 0.0

    tip_x, tip_y = get_pt(landmarks[tip_idx])
    wrist_x, wrist_y = get_pt(landmarks[0])
    joint_x, joint_y = get_pt(landmarks[joint_idx])

    dist_tip = ((tip_x - wrist_x)**2 + (tip_y - wrist_y)**2)**0.5
    dist_joint = ((joint_x - wrist_x)**2 + (joint_y - wrist_y)**2)**0.5

    return dist_tip > (dist_joint * 1.2) 

def apply_geometric_corrections(prediction, landmarks):
    middle_up = is_finger_extended(landmarks, 'middle')
    ring_up = is_finger_extended(landmarks, 'ring')
    pinky_up = is_finger_extended(landmarks, 'pinky')
    index_up = is_finger_extended(landmarks, 'index')
    
    if prediction in ['E', 'S']:
        if middle_up and ring_up and pinky_up:
            return 'F'

    if index_up and not middle_up and not ring_up and not pinky_up:
        if prediction in ['P', 'W', 'F']:
            return 'D'

    thumb_up = is_finger_extended(landmarks, 'thumb')
    if thumb_up and pinky_up and not index_up and not middle_up and not ring_up:
        if prediction in ['J', 'I']:
            return 'Y'

    return prediction

def run_static_inference(landmarks_data):
    global history_queue
    vec = pre_process_landmark_fix(landmarks_data)
    input_array = np.asarray([vec], dtype=np.float32)

    l1, c1 = get_prediction_model1(input_array)
    l2, c2 = get_prediction_model2(input_array)

    current_prediction = l1
    current_confidence = c1
    used_model = "NN"

    if model2 is not None and c2 > (c1 + 0.02): 
        current_prediction = l2
        current_confidence = c2
        used_model = "RF"

    if current_prediction and landmarks_data:
        original = current_prediction
        current_prediction = apply_geometric_corrections(current_prediction, landmarks_data)
        if current_prediction != original:
            current_confidence = 0.99

    if current_confidence < 0.50:
        current_prediction = None

    history_queue.append(current_prediction if current_prediction else "-")

    if len(history_queue) >= 3:
        most_common = Counter(history_queue).most_common(1)
        best_history_label, count = most_common[0]
        if count >= (len(history_queue) / 2) and best_history_label != "-":
            final_label = best_history_label
            final_conf = float(current_confidence or 0.85)
        else:
            final_label = "-"
            final_conf = 0.0
    else:
        final_label = "-"
        final_conf = 0.0

    return final_label, final_conf, used_model

# ---------------------------------------------------------
# Dynamic Hierarchical Classifier Setup
# ---------------------------------------------------------
GATING_MODEL_PATH = os.path.join(script_dir, 'checkpoints', 'gating_model', 'best_model.pth')
SPECIALIST_PATHS = [
    os.path.join(script_dir, 'checkpoints', 'group_0', 'best_model.pth'),
    os.path.join(script_dir, 'checkpoints', 'group_1', 'best_model.pth'),
    os.path.join(script_dir, 'checkpoints', 'group_2', 'best_model.pth')
]

dynamic_infer = None

def get_dynamic_infer():
    global dynamic_infer
    if dynamic_infer is None and os.path.exists(GATING_MODEL_PATH):
        try:
            print(f"Loading Dynamic Infer on {device}...", file=sys.stdout)
            dynamic_infer = HierarchicalInference(
                gating_model_path=GATING_MODEL_PATH,
                specialist_paths=SPECIALIST_PATHS,
                device=device
            )
            print("✅ Dynamic Infer loaded!", file=sys.stdout)
        except Exception as e:
            print(f"⚠️ Error loading Dynamic Infer: {e}", file=sys.stderr)
    return dynamic_infer

# ---------------------------------------------------------
# ZeroGPU Worker Function: Wraps GPU Execution on HF Spaces
# ---------------------------------------------------------
@spaces.GPU(duration=60)
def run_dynamic_video_inference(video_path: str):
    """
    Executes deep hierarchical transformer inference.
    Decorated with @spaces.GPU to dynamically request GPU slice on Hugging Face Spaces.
    """
    infer = get_dynamic_infer()
    if infer is None:
        raise RuntimeError("Dynamic hierarchical inference model is unavailable or failed to load.")
    return infer.predict(video_path, top_k=3)

# ---------------------------------------------------------
# Translation & Sentence Conversion
# ---------------------------------------------------------
def run_translation(raw_sentence: str, target_lang: str):
    if ISLConverter is not None:
        try:
            converter = ISLConverter()
            formed_sentence = converter.convert_to_english(raw_sentence)
        except Exception:
            formed_sentence = raw_sentence.capitalize()
    else:
        formed_sentence = raw_sentence.capitalize()

    if translate_text is not None:
        try:
            translated_sentence = translate_text(formed_sentence, target_lang)
        except Exception:
            translated_sentence = formed_sentence
    else:
        translated_sentence = formed_sentence

    return formed_sentence, translated_sentence

# ---------------------------------------------------------
# FastAPI App (Provides REST API to Render Backend)
# ---------------------------------------------------------
app = FastAPI(
    title="Indian Sign Language (ISL) ML Engine",
    description="Dual Static + Hierarchical Dynamic Sign Language Recognition and Translation Engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ISL ML Engine (Gradio + ZeroGPU)",
        "zerogpu_active": IS_ZEROGPU,
        "device": device,
        "model1_loaded": model1 is not None,
        "model2_loaded": model2 is not None,
        "dynamic_infer_loaded": dynamic_infer is not None
    }

@app.post("/predict/static")
async def predict_static_endpoint(request: Request):
    try:
        data = await request.json()
        if not data:
            return JSONResponse({"error": "No Data", "success": False}, status_code=400)

        landmarks = None
        if 'hands' in data and isinstance(data['hands'], list) and len(data['hands']) > 0:
            if 'landmarks' in data['hands'][0]:
                landmarks = data['hands'][0]['landmarks']
        elif 'landmarks' in data:
            landmarks = data['landmarks']

        if not landmarks:
            history_queue.clear()
            return {"prediction": "-", "confidence": 0.0, "success": True}

        final_label, final_conf, _ = run_static_inference(landmarks)
        return {"prediction": final_label, "confidence": final_conf, "success": True}

    except Exception as e:
        traceback.print_exc()
        return JSONResponse({"error": str(e), "success": False}, status_code=500)

@app.post("/predict/dynamic")
async def predict_dynamic_endpoint(video: UploadFile = File(...)):
    webm_path = None
    mp4_path = None
    try:
        suffix = os.path.splitext(video.filename or "")[1] or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_video:
            content = await video.read()
            temp_video.write(content)
            webm_path = temp_video.name

        final_video_path = webm_path
        if shutil.which("ffmpeg"):
            mp4_path = webm_path + ".converted.mp4"
            try:
                subprocess.run([
                    'ffmpeg', '-y',
                    '-i', webm_path,
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '23',
                    '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac',
                    mp4_path
                ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                final_video_path = mp4_path
            except Exception as fe:
                print(f"FFmpeg conversion skipped/failed: {fe}")

        result = run_dynamic_video_inference(final_video_path)
        top_pred = result.get("top_prediction", {})
        prediction_val = top_pred.get("class", "None")
        confidence_val = top_pred.get("overall_confidence", 0.0)

        if isinstance(confidence_val, float) and (np.isnan(confidence_val) or np.isinf(confidence_val)):
            confidence_val = 0.0

        return {
            "success": True,
            "prediction": prediction_val if prediction_val != "None" else "-",
            "confidence": float(confidence_val),
            "top_k": result.get("all_predictions", [])
        }

    except Exception as e:
        traceback.print_exc()
        return JSONResponse({
            "success": False,
            "prediction": "-",
            "confidence": 0.0,
            "error": str(e)
        }, status_code=500)
    finally:
        for p in [webm_path, mp4_path]:
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass

@app.post("/process_translate")
async def process_translate_endpoint(request: Request):
    try:
        data = await request.json()
        raw_sentence = data.get("sentence", "")
        target_lang = data.get("language", "hi")
        formed, translated = run_translation(raw_sentence, target_lang)
        return {
            "success": True,
            "formed_sentence": formed,
            "translated_sentence": translated
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

# ---------------------------------------------------------
# Gradio UI Functions
# ---------------------------------------------------------
def gradio_predict_video(video_path):
    if not video_path:
        return "⚠️ Please upload or record a video first.", {}, {}
    try:
        result = run_dynamic_video_inference(video_path)
        top = result.get("top_prediction", {})
        predicted_word = top.get("class", "-")
        overall_conf = float(top.get("overall_confidence", 0.0))
        group_idx = result.get("group_predicted", 0)

        group_names = {
            0: "Group 0: Pronouns & Time (I, You, Today, Tomorrow...)",
            1: "Group 1: Objects & Places (School, Home, Bag, Market...)",
            2: "Group 2: Actions & Descriptors (Happy, Sad, Big, Red...)"
        }
        group_desc = group_names.get(group_idx, f"Group {group_idx}")

        md_output = f"""
## 🎯 Recognized Sign: **{predicted_word}**
- **Overall Confidence:** **{overall_conf * 100:.1f}%**
- **Semantic Group:** {group_desc}
- **Stage 1 Gating Confidence:** {result.get('gating_confidence', 0.0)*100:.1f}%
- **Stage 2 Specialist Confidence:** {top.get('specialist_confidence', 0.0)*100:.1f}%
"""
        top_k_dict = {}
        for p in result.get("all_predictions", []):
            top_k_dict[p["class"]] = float(p.get("probability", 0.0))

        return md_output, top_k_dict, result
    except Exception as e:
        return f"❌ Error during inference: {str(e)}", {}, {"error": str(e)}

def gradio_translate(sentence, lang_code):
    if not sentence or not sentence.strip():
        return "", ""
    try:
        formed, translated = run_translation(sentence, lang_code)
        return formed, translated
    except Exception as e:
        return f"Error: {e}", f"Error: {e}"

# ---------------------------------------------------------
# Gradio Blocks Web Application
# ---------------------------------------------------------
custom_css = """
.main-header {
    text-align: center;
    padding: 1.5rem 1rem;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: white;
    border-radius: 12px;
    margin-bottom: 1.5rem;
}
.main-header h1 {
    font-size: 2.2rem;
    font-weight: 800;
    margin: 0;
    color: white !important;
}
.main-header p {
    font-size: 1.05rem;
    opacity: 0.92;
    margin-top: 0.5rem;
}
.badge-bar {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    margin-top: 0.75rem;
    flex-wrap: wrap;
}
.badge-item {
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(8px);
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.85rem;
    font-weight: 600;
}
"""

with gr.Blocks(title="ISL Recognition & Translation Engine", css=custom_css, theme=gr.themes.Soft(primary_hue="indigo")) as demo:
    gr.HTML("""
    <div class="main-header">
        <h1>🤟 Indian Sign Language (ISL) AI Engine</h1>
        <p>Production Dual-Stream Transformer & Hierarchical Specialist Architecture</p>
        <div class="badge-bar">
            <span class="badge-item">⚡ ZeroGPU Accelerated</span>
            <span class="badge-item">🎯 2-Stage Gating + Specialist</span>
            <span class="badge-item">🌐 Multi-Language NLP</span>
            <span class="badge-item">🔌 REST API Ready</span>
        </div>
    </div>
    """)

    with gr.Tabs():
        with gr.TabItem("🎥 Dynamic Video Recognition (ZeroGPU ⚡)"):
            gr.Markdown("Upload or record a sign video. The **Hierarchical Transformer** runs Stage 1 gating to select the category group, followed by the specialist expert model.")
            with gr.Row():
                with gr.Column(scale=1):
                    video_input = gr.Video(label="Input Video", sources=["upload", "webcam"])
                    predict_btn = gr.Button("🚀 Run Recognition", variant="primary", size="lg")
                with gr.Column(scale=1):
                    result_md = gr.Markdown("### Prediction will appear here...")
                    top_k_label = gr.Label(label="Top Class Probabilities", num_top_classes=3)
                    with gr.Accordion("🔍 Deep Diagnostic Details (JSON)", open=False):
                        debug_json = gr.JSON(label="Detailed Model Probabilities")

            predict_btn.click(
                fn=gradio_predict_video,
                inputs=[video_input],
                outputs=[result_md, top_k_label, debug_json]
            )

        with gr.TabItem("🌐 ISL Sentence Translation"):
            gr.Markdown("Convert continuous ISL gloss phrases into grammatical English and translate into Indian languages.")
            with gr.Row():
                with gr.Column():
                    sentence_input = gr.Textbox(
                        label="ISL Gloss Input",
                        placeholder="e.g. I TODAY SCHOOL GO",
                        lines=3
                    )
                    lang_select = gr.Dropdown(
                        label="Target Indian Language",
                        choices=[
                            ("Hindi (हिंदी)", "hi"),
                            ("Punjabi (ਪੰਜਾਬੀ)", "pa"),
                            ("Bengali (বাংলা)", "bn"),
                            ("Gujarati (ગુજરાતી)", "gu"),
                            ("Marathi (मराठी)", "mr")
                        ],
                        value="hi"
                    )
                    translate_btn = gr.Button("✨ Form Sentence & Translate", variant="primary")
                with gr.Column():
                    english_output = gr.Textbox(label="Grammatical English Sentence", lines=2)
                    translated_output = gr.Textbox(label="Translated Indian Language Output", lines=2)

            translate_btn.click(
                fn=gradio_translate,
                inputs=[sentence_input, lang_select],
                outputs=[english_output, translated_output]
            )

        with gr.TabItem("🔌 REST API & Integration"):
            gr.Markdown("""
### 🔗 How Your Frontend / Backend Connects to this Space
This Hugging Face Space hosts both this **Gradio Web Interface** and a **FastAPI REST API**.
Your Node.js backend on Render (`apps/api`) can call these endpoints directly by configuring:
```env
ISL_ENGINE_BASE_URL=https://<your-username>-<your-space-name>.hf.space
```

#### Available REST Endpoints:
| Method | Endpoint | Description | Input |
|---|---|---|---|
| `GET` | `/health` | Healthcheck & ZeroGPU status | None |
| `POST` | `/predict/static` | Static fingerspelling prediction | JSON: `{"landmarks": [...]}` |
| `POST` | `/predict/dynamic` | Video sign recognition (ZeroGPU) | Multipart: `video` file |
| `POST` | `/process_translate` | ISL gloss sentence translation | JSON: `{"sentence": "...", "language": "hi"}` |
""")

# ---------------------------------------------------------
# Mount Gradio onto FastAPI
# ---------------------------------------------------------
app = gr.mount_gradio_app(app, demo, path="/")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ISL_ENGINE_PORT", os.environ.get("PORT", 7860)))
    print(f"🚀 Starting ISL ML Engine (Gradio + FastAPI + ZeroGPU) on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)