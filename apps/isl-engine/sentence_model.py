
import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    try:
        genai.configure(api_key=api_key)
    except Exception as e:
        print(f"[Gemini] Configuration warning: {e}")

MODEL_CANDIDATES = [
    "gemini-2.5-pro",
    "gemini-1.5-pro",
    "gemini-1.5-flash"
]

def build_sentence(isl_sentence: str) -> str:
    """
    Converts ISL sentence to grammatical English using Gemini.

    Input:  "I TODAY BLUE SHIRT SCHOOL"
    Output: "I am wearing a blue shirt to school today."
    """
    if not isl_sentence or not isl_sentence.strip():
        return ""

    if not api_key:
        # Fallback heuristic if API key is not configured
        cleaned = " ".join(isl_sentence.strip().split())
        return cleaned.capitalize() + "."

    prompt = f"""
Convert this Indian Sign Language (ISL) sentence into proper,
grammatical English. Do not explain. Only return the sentence.

ISL: {isl_sentence}

English:
""".strip()

    response = None

    for model_name in MODEL_CANDIDATES:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            break
        except Exception as e:
            print(f"[Gemini] Failed with {model_name}: {e}")

    if response and hasattr(response, "text"):
        return response.text.strip()

    return isl_sentence.capitalize()

class ISLConverter:
    """Class wrapper for converting ISL gloss strings into fluent English."""
    def convert_to_english(self, isl_sentence: str) -> str:
        return build_sentence(isl_sentence)