"""
Rule-Based ISL (Indian Sign Language) SOV -> SVO Grammar Engine
Phase 2: Sign Gloss Sequence to Grammatical English Sentence.

Indian Sign Language predominantly follows Subject-Object-Verb (SOV) or
Time-Subject-Object-Verb (TSOV) topic-prominent syntax without copulas ('is/are')
or prepositions ('to/on/at').

This engine provides a deterministic, zero-latency linguistic reorderer specifically
calibrated to the 28 dynamic vocabulary signs and static finger-spelled alphabet
of apps/isl-engine. It is explicitly documented as a rule-based stopgap (ADR-037),
preserving the repository's strict standard of never misrepresenting heuristics as trained models.
"""

import re
from typing import List, Dict, Optional, Tuple

# Vocabulary Categories for apps/isl-engine
PRONOUNS_1ST = {"i", "me", "we"}
PRONOUNS_2ND = {"you"}
PRONOUNS_3RD_SINGULAR = {"he", "she", "father", "girl", "child", "doctor", "dog"}
PRONOUNS_3RD_PLURAL = {"they"}

PEOPLE_NOUNS = {"father", "girl", "child", "doctor"}
ANIMALS = {"dog"}
LOCATIONS = {"school", "hospital", "park", "market", "city", "street", "home"}
CLOTHING = {"shirt", "dress", "hat", "shoe"}
COLORS = {"black", "yellow"}
ADJECTIVES = {"happy", "heavy", "black", "yellow"}
TIME_MARKERS = {"monday", "night", "today", "tomorrow", "yesterday"}
GREETINGS = {"how_are_you_", "how are you", "how are you?"}
CONVERSATIONAL = {"thank you", "thank_you", "thanks"}

PREPOSITIONS_FOR_LOCATION = {
    "school": "to school",
    "hospital": "to the hospital",
    "park": "to the park",
    "market": "to the market",
    "city": "in the city",
    "street": "on the street",
    "home": "home",
}

PREPOSITIONS_AT_LOCATION = {
    "school": "at school",
    "hospital": "at the hospital",
    "park": "in the park",
    "market": "at the market",
    "city": "in the city",
    "street": "on the street",
    "home": "at home",
}

def normalize_gloss(token: str) -> str:
    """Cleans up formatting quirks in model output (e.g. trailing spaces, underscores)."""
    t = token.strip().lower()
    t = t.replace("_", " ").strip()
    return t

def format_subject(sub: str, capitalize_first: bool = True) -> str:
    """Applies proper casing and articles to subjects."""
    s = sub.lower()
    if s == "i":
        return "I"
    if s in {"he", "she", "you", "they"}:
        return s.capitalize() if capitalize_first else s
    if s in PEOPLE_NOUNS or s in ANIMALS:
        if s == "father":
            return "Father" if capitalize_first else "father"
        prefix = "The " if capitalize_first else "the "
        return prefix + s
    return s.capitalize() if capitalize_first else s

def get_copula(subject: str) -> str:
    """Returns correct copula ('am', 'is', 'are') for the given subject."""
    s = subject.lower()
    if s in PRONOUNS_1ST:
        return "am"
    if s in PRONOUNS_3RD_SINGULAR or s in PEOPLE_NOUNS or s in ANIMALS:
        return "is"
    return "are"

def get_action_verb(subject: str, verb_base: str = "go") -> str:
    """Returns third-person inflected verb ('goes', 'wears') or base form."""
    s = subject.lower()
    if s in PRONOUNS_3RD_SINGULAR or s in PEOPLE_NOUNS or s in ANIMALS:
        if verb_base == "go":
            return "goes"
        if verb_base == "have":
            return "has"
        if verb_base == "wear":
            return "is wearing"
        if verb_base == "take":
            return "takes"
        return verb_base + "s"
    else:
        if verb_base == "wear":
            return "am wearing" if s == "i" else "are wearing"
        return verb_base

def merge_fingerspelled_tokens(tokens: List[str]) -> List[str]:
    """
    Merges consecutive single-letter tokens (from static A-Z alphabet recognizer)
    into single words. E.g. ['H', 'E', 'L', 'L', 'O'] -> ['Hello']
    """
    merged = []
    current_spelling = []

    for t in tokens:
        cleaned = t.strip()
        if len(cleaned) == 1 and cleaned.isalpha():
            current_spelling.append(cleaned)
        else:
            if current_spelling:
                merged.append("".join(current_spelling).capitalize())
                current_spelling = []
            merged.append(cleaned)

    if current_spelling:
        merged.append("".join(current_spelling).capitalize())

    return merged

class ISLGrammarEngine:
    """
    Deterministic rule-based SOV -> SVO sentence generator.
    Translates sequences of ISL glosses into grammatical English sentences.
    """
    def __init__(self):
        self.name = "isl-rule-based-grammar-v1"
        self.trained = False  # Honestly labeled

    def format_sentence(self, gloss_sequence) -> str:
        """
        Main entrypoint. Accepts:
          - A string: 'I School Monday'
          - A list of gloss strings: ['I', 'School', 'Monday']
        Returns a grammatically structured English sentence.
        """
        if not gloss_sequence:
            return ""

        if isinstance(gloss_sequence, str):
            # Split on commas or spaces
            raw_tokens = [tok.strip() for tok in re.split(r'[, ]+', gloss_sequence.strip()) if tok.strip()]
        elif isinstance(gloss_sequence, (list, tuple)):
            raw_tokens = [str(tok).strip() for tok in gloss_sequence if tok is not None and str(tok).strip() and str(tok).strip().lower() != "none"]
        else:
            raw_tokens = []

        if not raw_tokens:
            return ""

        # Step 1: Handle fingerspelled letter sequences
        tokens = merge_fingerspelled_tokens(raw_tokens)
        if len(tokens) == 1:
            norm = normalize_gloss(tokens[0])
            if norm in GREETINGS:
                return "How are you?"
            if norm in CONVERSATIONAL:
                return "Thank you."
            return tokens[0].capitalize() + "."

        norm_tokens = [normalize_gloss(t) for t in tokens]

        # Step 2: Conversational Shortcuts
        if any(t in GREETINGS for t in norm_tokens):
            return "How are you?"
        if any(t in CONVERSATIONAL for t in norm_tokens):
            if any(t in {"i", "we"} for t in norm_tokens):
                return "I thank you."
            return "Thank you."

        # Categorize tokens
        subjects = []
        locations = []
        clothing_items = []
        colors = []
        adjectives = []
        times = []
        others = []

        for orig, norm in zip(tokens, norm_tokens):
            if norm in PRONOUNS_1ST or norm in PRONOUNS_2ND or norm in PRONOUNS_3RD_SINGULAR or norm in PEOPLE_NOUNS or norm in ANIMALS:
                subjects.append(norm)
            elif norm in LOCATIONS:
                locations.append(norm)
            elif norm in CLOTHING:
                clothing_items.append(norm)
            elif norm in COLORS:
                colors.append(norm)
            elif norm in ADJECTIVES:
                adjectives.append(norm)
            elif norm in TIME_MARKERS:
                times.append(norm)
            else:
                others.append(orig)

        # Rule Pattern 1: Time + Subject + Location (TSOV / SOTV)
        # e.g. ["I", "School", "Monday"] -> "I go to school on Monday."
        if subjects and locations and times:
            sub = format_subject(subjects[0])
            loc = PREPOSITIONS_FOR_LOCATION.get(locations[0], f"to {locations[0]}")
            verb = get_action_verb(subjects[0], "go")
            time_str = f"on {times[0].capitalize()}" if times[0] in {"monday"} else times[0]
            return f"{sub} {verb} {loc} {time_str}."

        # Rule Pattern 2: Subject + Location
        # e.g. ["Father", "Hospital"] -> "Father goes to the hospital."
        # e.g. ["Doctor", "Hospital"] -> "The doctor is at the hospital."
        if subjects and locations and not clothing_items and not adjectives:
            sub = format_subject(subjects[0])
            # If subject is a professional at their venue (Doctor at hospital)
            if subjects[0] == "doctor" and locations[0] == "hospital":
                loc_at = PREPOSITIONS_AT_LOCATION.get(locations[0], f"at the {locations[0]}")
                return f"{sub} is {loc_at}."
            if subjects[0] in ANIMALS and locations[0] == "park":
                return f"{sub} is in the park."
            
            verb = get_action_verb(subjects[0], "go")
            loc = PREPOSITIONS_FOR_LOCATION.get(locations[0], f"to {locations[0]}")
            return f"{sub} {verb} {loc}."

        # Rule Pattern 3: Subject + Clothing + (Color/Adjective)
        # e.g. ["He", "Black", "Shirt"] -> "He is wearing a black shirt."
        # e.g. ["Girl", "Yellow", "Dress"] -> "The girl is wearing a yellow dress."
        if subjects and clothing_items:
            sub = format_subject(subjects[0])
            color = colors[0] if colors else (adjectives[0] if adjectives else "")
            clothing = clothing_items[0]
            article = "a"
            if color.startswith(("a", "e", "i", "o", "u")):
                article = "an"
            
            wear_verb = get_action_verb(subjects[0], "wear")
            if color:
                return f"{sub} {wear_verb} {article} {color} {clothing}."
            else:
                return f"{sub} {wear_verb} a {clothing}."

        # Rule Pattern 4: Multiple Subjects + Adjective
        # e.g. ["Doctor", "Child", "Happy"] -> "The doctor and child are happy."
        if len(subjects) >= 2 and (adjectives or colors):
            sub1 = format_subject(subjects[0], capitalize_first=True)
            sub2 = format_subject(subjects[1], capitalize_first=False)
            adj = adjectives[0] if adjectives else colors[0]
            return f"{sub1} and {sub2} are {adj}."

        # Rule Pattern 5: Single Subject + Adjective
        # e.g. ["Child", "Happy"] -> "The child is happy."
        if subjects and (adjectives or colors) and not locations:
            sub = format_subject(subjects[0])
            copula = get_copula(subjects[0])
            adj = adjectives[0] if adjectives else colors[0]
            return f"{sub} {copula} {adj}."

        # Rule Pattern 6: Noun (Location/Object) + Adjective
        # e.g. ["Shoe", "Heavy"] -> "The shoe is heavy."
        # e.g. ["Night", "Heavy"] -> "The night is heavy."
        if (clothing_items or locations or times) and (adjectives or colors):
            item = (clothing_items or locations or times)[0]
            adj = adjectives[0] if adjectives else colors[0]
            return f"The {item} is {adj}."

        # Rule Pattern 7: Location + Location
        # e.g. ["Market", "City"] -> "The market is in the city."
        if len(locations) >= 2:
            loc1 = locations[0].capitalize()
            loc2 = locations[1]
            return f"The {loc1} is in the {loc2}."

        # Rule Pattern 8: Animal + Park
        # e.g. ["Dog", "Park"] -> "The dog is in the park."
        if subjects and "dog" in subjects and locations and "park" in locations:
            return "The dog is in the park."

        # Fallback: Natural capitalized join with full stop
        cleaned = " ".join(tokens)
        return cleaned.capitalize() + "."

grammar_engine = ISLGrammarEngine()
