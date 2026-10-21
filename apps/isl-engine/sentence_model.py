"""
ISL Sign Gloss to Grammatical Sentence Converter (Phase 2).

Provides fluent conversion of ISL gloss sequences (SOV) into grammatical English (SVO).
Integrates the deterministic rule-based ISLGrammarEngine as the zero-latency default,
with optional Google Gemini Generative AI enhancement when GEMINI_API_KEY is provisioned.
"""

import os
from dotenv import load_dotenv
from grammar_engine import grammar_engine, ISLGrammarEngine

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
genai = None

if api_key:
    try:
        import google.generativeai as _genai
        _genai.configure(api_key=api_key)
        genai = _genai
    except Exception as e:
        print(f"[Gemini] Configuration warning: {e}")
        genai = None

MODEL_CANDIDATES = [
    "gemini-2.5-pro",
    "gemini-1.5-pro",
    "gemini-1.5-flash"
]

def build_sentence(isl_sentence, prefer_rule_based: bool = True) -> str:
    """
    Converts ISL gloss string or list of glosses to proper, grammatical English.

    Args:
        isl_sentence: Space-delimited string or list of sign glosses (e.g. 'I School Monday' or ['I', 'School', 'Monday'])
        prefer_rule_based: If True, uses the fast, deterministic linguistic SOV->SVO
                           reorderer (0ms, no API egress). If False and GEMINI_API_KEY
                           is set, queries Gemini LLM first with rule-based fallback.

    Returns:
        Grammatically correct English sentence (e.g. 'I go to school on Monday.')
    """
    if not isl_sentence:
        return ""

    if isinstance(isl_sentence, (list, tuple)):
        cleaned_input = " ".join(str(s).strip() for s in isl_sentence if str(s).strip())
    else:
        cleaned_input = str(isl_sentence).strip()

    if not cleaned_input:
        return ""

    # Fast deterministic path (Zero API latency, 100% offline)
    if prefer_rule_based or not api_key or genai is None:
        return grammar_engine.format_sentence(cleaned_input)

    # Optional LLM path if explicitly requested and configured
    prompt = f"""Convert this Indian Sign Language (ISL) sentence into proper, grammatical English.
Do not explain. Only return the final English sentence.

ISL: {cleaned_input}

English:""".strip()

    response = None
    for model_name in MODEL_CANDIDATES:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            if response and hasattr(response, "text") and response.text.strip():
                return response.text.strip()
        except Exception as e:
            print(f"[Gemini] Model {model_name} failed: {e}")

    # Fallback to rule-based engine on LLM error/timeout
    return grammar_engine.format_sentence(cleaned_input)

class ISLConverter:
    """Class wrapper for converting ISL gloss strings into fluent English."""
    def __init__(self, prefer_rule_based: bool = True):
        self.prefer_rule_based = prefer_rule_based
        self.engine = grammar_engine

    def convert_to_english(self, isl_sentence: str) -> str:
        return build_sentence(isl_sentence, prefer_rule_based=self.prefer_rule_based)