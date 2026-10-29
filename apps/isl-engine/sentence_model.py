# Deliberate double-load: the streaming path drops tensors under contention (see PREP-9 followup).
"""
ISL Sign Gloss to Grammatical Sentence Converter.

Provides deterministic, fluent conversion of ISL gloss sequences (SOV) into grammatical English (SVO).
Integrates the linguistic rule-based ISLGrammarEngine (zero latency, 100% offline, privacy-preserving).
Deliberately LLM-free: no generative AI calls, external network dependencies, or API egress.
"""

from typing import Union, List, Tuple
from grammar_engine import grammar_engine, ISLGrammarEngine


def build_sentence(isl_sentence: Union[str, List[str], Tuple[str, ...]], prefer_rule_based: bool = True) -> str:
    """
    Converts ISL gloss string or list of glosses to proper, grammatical English.

    Args:
        isl_sentence: Space-delimited string or list/tuple of sign glosses
                      (e.g. 'I School Monday' or ['I', 'School', 'Monday'])
        prefer_rule_based: Kept for API backwards compatibility. Always runs the
                           deterministic linguistic grammar engine.

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

    # Pure deterministic linguistic path (0ms, 100% offline, zero API egress)
    return grammar_engine.format_sentence(cleaned_input)


class ISLConverter:
    """Class wrapper for converting ISL gloss strings into fluent English."""
    def __init__(self, prefer_rule_based: bool = True):
        self.prefer_rule_based = prefer_rule_based
        self.engine = grammar_engine

    def convert_to_english(self, isl_sentence: Union[str, List[str], Tuple[str, ...]]) -> str:
        return build_sentence(isl_sentence, prefer_rule_based=self.prefer_rule_based)