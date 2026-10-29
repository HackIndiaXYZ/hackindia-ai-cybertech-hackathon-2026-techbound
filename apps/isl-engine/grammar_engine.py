"""
Rule-Based ISL (Indian Sign Language) SOV -> SVO Grammar Engine
Deterministic, Linguistic Sign Gloss Sequence to Grammatical English Sentence Converter.

Indian Sign Language predominantly follows Subject-Object-Verb (SOV) or
Time-Subject-Object-Verb (TSOV) topic-prominent syntax without copulas ('is/are')
or prepositions ('to/on/at'). Interrogative question words (wh-words) and negation
markers are predominantly placed clause-finally.

This engine provides a deterministic, zero-latency linguistic reorderer calibrated
to the ISL vocabulary and fingerspelling. It is strictly rule-based, offline, and
explainable (ADR-037), completely eliminating generative LLM dependencies.
"""

import re
from typing import List, Dict, Optional, Tuple, Set

# --- Pronoun & Subject Categories ---
PRONOUNS_1ST = {"i", "me", "we", "us", "self"}
PRONOUNS_2ND = {"you", "your"}
PRONOUNS_3RD_SINGULAR = {"he", "she", "him", "her", "it"}
PRONOUNS_3RD_PLURAL = {"they", "them"}

PEOPLE_NOUNS = {
    "father", "mother", "girl", "boy", "child", "doctor", "teacher",
    "friend", "person", "student", "brother", "sister"
}
PLURAL_PEOPLE = {"children", "friends", "students", "people"}
ANIMALS = {"dog", "cat", "bird", "cow"}

# --- Places & Locations ---
LOCATIONS = {
    "school", "hospital", "park", "market", "city", "street", "home",
    "office", "bank", "station", "shop", "room"
}

# --- Objects, Clothing, Food & Drink ---
CLOTHING = {"shirt", "dress", "hat", "shoe", "shoes", "pants", "coat"}
FOOD_AND_DRINK = {"water", "food", "tea", "coffee", "milk", "bread", "rice", "fruit", "apple"}
OBJECTS = {"book", "pen", "phone", "bag", "money", "car", "bus", "train", "computer", "door", "table"}

# --- Descriptors & Adjectives ---
COLORS = {"black", "yellow", "white", "red", "blue", "green"}
ADJECTIVES = {
    "happy", "heavy", "black", "yellow", "good", "bad", "big", "small",
    "hot", "cold", "sad", "sick", "tired", "beautiful", "new", "old",
    "clean", "dirty", "white", "red", "blue", "green"
}

# --- Time Markers ---
TIME_MARKERS = {
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "night", "today", "tomorrow", "yesterday", "morning", "afternoon", "evening",
    "now", "time", "later"
}

# --- Actions and Verbs ---
VERBS_WANT = {"want", "need", "like", "love"}
VERBS_INGEST = {"eat", "drink"}
VERBS_MOTION = {"go", "come", "walk", "run", "travel", "arrive", "leave"}
VERBS_COMMUNICATION = {"say", "speak", "tell", "ask", "help", "know", "understand", "study", "learn", "teach", "read", "write"}
VERBS_OTHER = {"see", "look", "hear", "listen", "work", "play", "stop", "wait", "meet", "buy", "give", "take", "wear", "live"}

ALL_VERBS = VERBS_WANT | VERBS_INGEST | VERBS_MOTION | VERBS_COMMUNICATION | VERBS_OTHER

# --- Grammar Modifiers ---
NEGATION_TOKENS = {"not", "no", "never", "dont", "don't", "cannot", "cant", "can't"}
QUESTION_WORDS = {"what", "where", "who", "when", "why", "how", "which"}

# --- Conversational & Greetings ---
GREETINGS = {"how_are_you_", "how are you", "how are you?", "hello", "hi", "namaste"}
CONVERSATIONAL = {"thank you", "thank_you", "thanks", "welcome", "please", "sorry", "yes", "no"}

PREPOSITIONS_FOR_LOCATION = {
    "school": "to school",
    "hospital": "to the hospital",
    "park": "to the park",
    "market": "to the market",
    "city": "in the city",
    "street": "on the street",
    "home": "home",
    "office": "to the office",
    "bank": "to the bank",
    "station": "to the station",
    "shop": "to the shop",
    "room": "into the room",
}

PREPOSITIONS_AT_LOCATION = {
    "school": "at school",
    "hospital": "at the hospital",
    "park": "in the park",
    "market": "at the market",
    "city": "in the city",
    "street": "on the street",
    "home": "at home",
    "office": "at the office",
    "bank": "at the bank",
    "station": "at the station",
    "shop": "at the shop",
    "room": "in the room",
}


def normalize_gloss(token: str) -> str:
    """Cleans up formatting quirks in model output (e.g. trailing spaces, underscores)."""
    t = token.strip().lower()
    t = t.replace("_", " ").strip()
    return t


def is_plural(subject: str) -> bool:
    """Detects if the subject implies plural verb agreement."""
    s = subject.lower()
    return s in PRONOUNS_3RD_PLURAL or s in PLURAL_PEOPLE or s == "we"


def format_subject(sub: str, capitalize_first: bool = True) -> str:
    """Applies proper casing and articles to subjects."""
    s = sub.lower()
    if s == "i" or s == "self":
        return "I"
    if s in {"he", "she", "you", "they", "we"}:
        return s.capitalize() if capitalize_first else s
    if s in PEOPLE_NOUNS or s in ANIMALS:
        if s == "father":
            return "Father" if capitalize_first else "father"
        if s == "mother":
            return "Mother" if capitalize_first else "mother"
        prefix = "The " if capitalize_first else "the "
        return prefix + s
    if s in PLURAL_PEOPLE:
        prefix = "The " if capitalize_first else "the "
        return prefix + s
    return s.capitalize() if capitalize_first else s


def get_copula(subject: str, negative: bool = False) -> str:
    """Returns correct copula ('am', 'is', 'are') with optional negation."""
    s = subject.lower()
    if s == "i" or s == "self":
        return "am not" if negative else "am"
    if s in PRONOUNS_3RD_SINGULAR or s in PEOPLE_NOUNS or s in ANIMALS:
        return "is not" if negative else "is"
    return "are not" if negative else "are"


def get_aux_negation(subject: str) -> str:
    """Returns 'does not' vs 'do not' based on subject agreement."""
    s = subject.lower()
    if s in PRONOUNS_3RD_SINGULAR or s in PEOPLE_NOUNS or s in ANIMALS:
        return "does not"
    return "do not"


def get_action_verb(subject: str, verb_base: str = "go", negative: bool = False) -> str:
    """Returns inflected verb or negated verb phrase based on subject."""
    s = subject.lower()
    is_3rd_sing = (s in PRONOUNS_3RD_SINGULAR or s in PEOPLE_NOUNS or s in ANIMALS)

    if negative:
        aux = "does not" if is_3rd_sing else "do not"
        return f"{aux} {verb_base}"

    if is_3rd_sing:
        if verb_base == "go":
            return "goes"
        if verb_base == "have":
            return "has"
        if verb_base == "wear":
            return "is wearing"
        if verb_base == "take":
            return "takes"
        if verb_base == "eat":
            return "eats"
        if verb_base == "drink":
            return "drinks"
        if verb_base == "study":
            return "studies"
        if verb_base.endswith("ch") or verb_base.endswith("sh") or verb_base.endswith("ss"):
            return verb_base + "es"
        return verb_base + "s"
    else:
        if verb_base == "wear":
            return "am wearing" if s in {"i", "self"} else "are wearing"
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
    Deterministic linguistic rule-based SOV -> SVO sentence generator.
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
            raw_tokens = [tok.strip() for tok in re.split(r'[, ]+', gloss_sequence.strip()) if tok.strip()]
        elif isinstance(gloss_sequence, (list, tuple)):
            raw_tokens = [str(tok).strip() for tok in gloss_sequence if tok is not None and str(tok).strip() and str(tok).strip().lower() != "none"]
        else:
            raw_tokens = []

        if not raw_tokens:
            return ""

        # Step 1: Handle fingerspelled letter sequences
        tokens = list(reversed(merge_fingerspelled_tokens(raw_tokens)))
        norm_tokens = [normalize_gloss(t)[::-1] for t in tokens]

        # Step 2: Single-token shortcuts & conversational basics
        if len(tokens) == 1:
            norm = norm_tokens[0]
            if norm in GREETINGS:
                if "how" in norm:
                    return "How are you?"
                if norm == "namaste":
                    return "Namaste."
                return "Hello."
            if norm in {"thank you", "thank_you", "thanks"}:
                return "Thank you."
            if norm in {"sorry"}:
                return "I am sorry."
            if norm in {"please"}:
                return "Please."
            if norm in {"yes"}:
                return "Yes."
            if norm in {"no"}:
                return "No."
            if norm in {"help"}:
                return "Help."
            return tokens[0].capitalize() + "."

        # Conversational Shortcuts
        if any(t in {"how are you", "how_are_you_", "how are you?"} for t in norm_tokens):
            return "How are you?"
        if any(t in {"thank you", "thank_you", "thanks"} for t in norm_tokens):
            if any(t in {"i", "we", "self"} for t in norm_tokens):
                return "I thank you."
            return "Thank you."
        if any(t in {"namaste"} for t in norm_tokens) and len(norm_tokens) <= 2:
            return "Namaste."
        if any(t in {"sorry"} for t in norm_tokens) and len(norm_tokens) <= 2:
            return "I am sorry."
        if "help" in norm_tokens and (any(t in {"me", "i", "us"} for t in norm_tokens) or any(t in {"you"} for t in norm_tokens) or any(t in {"please"} for t in norm_tokens)):
            if not any(t in {"need", "want"} for t in norm_tokens):
                return "Please help me."

        # Step 3: Identify Negation and Question status
        is_negative = any(t in NEGATION_TOKENS for t in norm_tokens)
        question_words = [t for t in norm_tokens if t in QUESTION_WORDS]
        is_question = len(question_words) > 0

        # Categorize tokens (excluding pure negation tokens and question words for core slotting)
        subjects = []
        locations = []
        clothing_items = []
        food_items = []
        objects = []
        colors = []
        adjectives = []
        times = []
        verbs = []
        others = []

        has_need_want = any(t in {"need", "want"} for t in norm_tokens)

        for orig, norm in zip(tokens, norm_tokens):
            if norm in NEGATION_TOKENS or norm in QUESTION_WORDS:
                continue
            if (norm in PRONOUNS_1ST or norm in PRONOUNS_2ND or norm in PRONOUNS_3RD_SINGULAR or
                norm in PRONOUNS_3RD_PLURAL or norm in PEOPLE_NOUNS or norm in PLURAL_PEOPLE or norm in ANIMALS):
                subjects.append(norm)
            elif norm in LOCATIONS:
                locations.append(norm)
            elif norm in CLOTHING:
                clothing_items.append(norm)
            elif norm in FOOD_AND_DRINK:
                food_items.append(norm)
            elif norm in OBJECTS:
                objects.append(norm)
            elif norm in COLORS:
                colors.append(norm)
            elif norm in ADJECTIVES:
                adjectives.append(norm)
            elif norm in TIME_MARKERS:
                times.append(norm)
            elif norm == "help" and has_need_want:
                objects.append("help")
            elif norm in ALL_VERBS:
                verbs.append(norm)
            else:
                others.append(orig)

        # -------------------------------------------------------------
        # Rule Pattern Q: Question Construction (WH-questions)
        # -------------------------------------------------------------
        if is_question:
            qw = question_words[0]
            # e.g. ["You", "Name", "What"] -> "What is your name?"
            if qw == "what":
                if any(t in {"name"} for t in norm_tokens):
                    poss = "your" if any(t in {"you", "your"} for t in norm_tokens) else "the"
                    return f"What is {poss} name?"
                if any(t in {"time"} for t in norm_tokens):
                    return "What time is it?"
                if subjects and verbs:
                    sub = format_subject(subjects[0], capitalize_first=False)
                    aux = "do" if sub in {"you", "they", "we", "i"} else "does"
                    return f"What {aux} {sub} {verbs[0]}?"
                if food_items or objects:
                    target = (food_items or objects)[0]
                    return f"What is that {target}?"
                return "What is this?"

            # e.g. ["Hospital", "Where"] -> "Where is the hospital?"
            # e.g. ["You", "Live", "Where"] -> "Where do you live?"
            # e.g. ["You", "Go", "Where"] -> "Where are you going?"
            if qw == "where":
                if locations:
                    loc = locations[0]
                    return f"Where is the {loc}?"
                if subjects and any(v in {"live"} for v in verbs):
                    sub = format_subject(subjects[0], capitalize_first=False)
                    aux = "do" if sub in {"you", "they", "we", "i"} else "does"
                    return f"Where {aux} {sub} live?"
                if subjects and any(v in {"go"} for v in verbs):
                    sub = format_subject(subjects[0], capitalize_first=False)
                    copula = "are" if sub in {"you", "they", "we"} else ("am" if sub == "i" else "is")
                    return f"Where {copula} {sub} going?"
                if subjects:
                    sub = format_subject(subjects[0], capitalize_first=False)
                    copula = get_copula(subjects[0])
                    return f"Where {copula} {sub}?"
                return "Where is it?"

            # e.g. ["Doctor", "Who"] -> "Who is the doctor?"
            if qw == "who":
                if subjects:
                    sub = format_subject(subjects[0], capitalize_first=False)
                    return f"Who is {sub}?"
                return "Who is that?"

            if qw == "when":
                if verbs and subjects:
                    sub = format_subject(subjects[0], capitalize_first=False)
                    aux = "do" if sub in {"you", "they", "we", "i"} else "does"
                    return f"When {aux} {sub} {verbs[0]}?"
                return "When is it?"

            if qw == "why":
                return "Why?"

            if qw == "how":
                return "How?"

        # -------------------------------------------------------------
        # Rule Pattern 1: Time + Subject + Location (TSOV / SOTV)
        # e.g. ["I", "School", "Monday"] -> "I go to school on Monday."
        # -------------------------------------------------------------
        if subjects and locations and times:
            sub = format_subject(subjects[0])
            loc = PREPOSITIONS_FOR_LOCATION.get(locations[0], f"to {locations[0]}")
            verb_base = verbs[0] if verbs else "go"
            verb = get_action_verb(subjects[0], verb_base, negative=is_negative)
            time_str = f"on {times[0].capitalize()}" if times[0] in {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"} else times[0]
            return f"{sub} {verb} {loc} {time_str}."

        # -------------------------------------------------------------
        # Rule Pattern: Subject + Clothing + (Color/Adjective)
        # e.g. ["He", "Black", "Shirt"] -> "He is wearing a black shirt."
        # e.g. ["Girl", "Yellow", "Dress"] -> "The girl is wearing a yellow dress."
        # -------------------------------------------------------------
        if subjects and clothing_items:
            sub = format_subject(subjects[0])
            color = colors[0] if colors else (adjectives[0] if adjectives else "")
            clothing = clothing_items[0]
            article = "a"
            if color.startswith(("a", "e", "i", "o", "u")):
                article = "an"

            if is_negative:
                aux = "is not wearing" if (subjects[0] in PRONOUNS_3RD_SINGULAR or subjects[0] in PEOPLE_NOUNS) else "are not wearing"
                if subjects[0] in {"i", "self"}:
                    aux = "am not wearing"
                if color:
                    return f"{sub} {aux} {article} {color} {clothing}."
                return f"{sub} {aux} a {clothing}."

            wear_verb = get_action_verb(subjects[0], "wear")
            if color:
                return f"{sub} {wear_verb} {article} {color} {clothing}."
            return f"{sub} {wear_verb} a {clothing}."

        # -------------------------------------------------------------
        # Rule Pattern 2: Subject + Object + Verb (SOV -> SVO)
        # e.g. ["I", "Water", "Want"] -> "I want water."
        # e.g. ["She", "Food", "Eat", "Not"] -> "She does not eat food."
        # e.g. ["I", "Help", "Need"] -> "I need help."
        # -------------------------------------------------------------
        direct_objects = food_items or objects
        if subjects and direct_objects and verbs:
            sub = format_subject(subjects[0])
            obj = direct_objects[0]
            verb_base = verbs[0]
            verb = get_action_verb(subjects[0], verb_base, negative=is_negative)
            # Determiner / article selection
            if obj in FOOD_AND_DRINK or obj in {"money", "help"}:
                obj_str = obj
            else:
                article = "an" if obj.startswith(("a", "e", "i", "o", "u")) else "a"
                obj_str = f"{article} {obj}"
            return f"{sub} {verb} {obj_str}."

        # e.g. ["I", "Water", "Want"] where 'want' was categorized in verbs
        if subjects and direct_objects and not verbs and not locations and not adjectives and not colors:
            # Check if one of tokens was an implicit request or desire
            sub = format_subject(subjects[0])
            obj = direct_objects[0]
            if is_negative:
                aux = get_aux_negation(subjects[0])
                return f"{sub} {aux} want {obj}."
            return f"{sub} want {obj}." if sub in {"I", "You", "We", "They"} else f"{sub} wants {obj}."

        # -------------------------------------------------------------
        # Rule Pattern 3: Subject + Action Verb (with optional Negation)
        # e.g. ["I", "Understand", "Not"] -> "I do not understand."
        # e.g. ["Student", "Study"] -> "The student studies."
        # -------------------------------------------------------------
        if subjects and verbs and not locations and not direct_objects:
            sub = format_subject(subjects[0])
            verb = get_action_verb(subjects[0], verbs[0], negative=is_negative)
            return f"{sub} {verb}."

        # -------------------------------------------------------------
        # Rule Pattern 4: Subject + Location
        # e.g. ["Father", "Hospital"] -> "Father goes to the hospital."
        # e.g. ["Doctor", "Hospital"] -> "The doctor is at the hospital."
        # e.g. ["Dog", "Park"] -> "The dog is in the park."
        # -------------------------------------------------------------
        if subjects and locations and not clothing_items and not adjectives:
            sub = format_subject(subjects[0])
            # Professional at work venue
            if subjects[0] == "doctor" and locations[0] == "hospital":
                loc_at = PREPOSITIONS_AT_LOCATION.get(locations[0], f"at the {locations[0]}")
                copula = get_copula(subjects[0], negative=is_negative)
                return f"{sub} {copula} {loc_at}."
            if subjects[0] in ANIMALS and locations[0] == "park":
                copula = get_copula(subjects[0], negative=is_negative)
                return f"{sub} {copula} in the park."

            verb_base = verbs[0] if verbs else "go"
            verb = get_action_verb(subjects[0], verb_base, negative=is_negative)
            loc = PREPOSITIONS_FOR_LOCATION.get(locations[0], f"to {locations[0]}")
            return f"{sub} {verb} {loc}."

        # -------------------------------------------------------------
        # Rule Pattern 5: Subject + Clothing + (Color/Adjective)
        # e.g. ["He", "Black", "Shirt"] -> "He is wearing a black shirt."
        # e.g. ["Girl", "Yellow", "Dress"] -> "The girl is wearing a yellow dress."
        # -------------------------------------------------------------
        if subjects and clothing_items:
            sub = format_subject(subjects[0])
            color = colors[0] if colors else (adjectives[0] if adjectives else "")
            clothing = clothing_items[0]
            article = "a"
            if color.startswith(("a", "e", "i", "o", "u")):
                article = "an"

            if is_negative:
                aux = "is not wearing" if (subjects[0] in PRONOUNS_3RD_SINGULAR or subjects[0] in PEOPLE_NOUNS) else "are not wearing"
                if subjects[0] in {"i", "self"}:
                    aux = "am not wearing"
                if color:
                    return f"{sub} {aux} {article} {color} {clothing}."
                return f"{sub} {aux} a {clothing}."

            wear_verb = get_action_verb(subjects[0], "wear")
            if color:
                return f"{sub} {wear_verb} {article} {color} {clothing}."
            return f"{sub} {wear_verb} a {clothing}."

        # -------------------------------------------------------------
        # Rule Pattern 6: Multiple Subjects + Adjective
        # e.g. ["Doctor", "Child", "Happy"] -> "The doctor and the child are happy."
        # -------------------------------------------------------------
        if len(subjects) >= 2 and (adjectives or colors):
            sub1 = format_subject(subjects[0], capitalize_first=True)
            sub2 = format_subject(subjects[1], capitalize_first=False)
            adj = adjectives[0] if adjectives else colors[0]
            copula = "are not" if is_negative else "are"
            return f"{sub1} and {sub2} {copula} {adj}."

        # -------------------------------------------------------------
        # Rule Pattern 7: Single Subject + Adjective / State
        # e.g. ["Child", "Happy"] -> "The child is happy."
        # e.g. ["I", "Sick", "Not"] -> "I am not sick."
        # -------------------------------------------------------------
        if subjects and (adjectives or colors) and not locations:
            sub = format_subject(subjects[0])
            copula = get_copula(subjects[0], negative=is_negative)
            adj = adjectives[0] if adjectives else colors[0]
            return f"{sub} {copula} {adj}."

        # -------------------------------------------------------------
        # Rule Pattern 8: Noun (Location/Object) + Adjective
        # e.g. ["Shoe", "Heavy"] -> "The shoe is heavy."
        # e.g. ["Night", "Heavy"] -> "The night is heavy."
        # -------------------------------------------------------------
        target_nouns = clothing_items or locations or times or food_items or objects
        if target_nouns and (adjectives or colors):
            item = target_nouns[0]
            adj = adjectives[0] if adjectives else colors[0]
            copula = "is not" if is_negative else "is"
            return f"The {item} {copula} {adj}."

        # -------------------------------------------------------------
        # Rule Pattern 9: Location + Location
        # e.g. ["Market", "City"] -> "The Market is in the city."
        # -------------------------------------------------------------
        if len(locations) >= 2:
            loc1 = locations[0].capitalize()
            loc2 = locations[1]
            return f"The {loc1} is in the {loc2}."

        # -------------------------------------------------------------
        # Rule Pattern 10: Animal + Park
        # e.g. ["Dog", "Park"] -> "The dog is in the park."
        # -------------------------------------------------------------
        if subjects and "dog" in subjects and locations and "park" in locations:
            copula = "is not" if is_negative else "is"
            return f"The dog {copula} in the park."

        # -------------------------------------------------------------
        # Rule Pattern 11: Conversational Help requests
        # e.g. ["Help", "Me"] / ["You", "Help", "Me"] -> "Please help me."
        # -------------------------------------------------------------
        if "help" in norm_tokens:
            if any(t in {"me", "i", "us"} for t in norm_tokens) or any(t in {"you"} for t in norm_tokens):
                return "Please help me."

        # -------------------------------------------------------------
        # Rule Pattern 12: Standalone Negation clause
        # e.g. ["Dog", "Happy", "Not"] covered in Pattern 7.
        # Fallback for negative statements:
        # -------------------------------------------------------------
        if is_negative and subjects:
            sub = format_subject(subjects[0])
            aux = get_aux_negation(subjects[0])
            non_neg_tokens = [t for t in tokens if normalize_gloss(t) not in NEGATION_TOKENS and normalize_gloss(t) not in subjects]
            if non_neg_tokens:
                return f"{sub} {aux} {' '.join(non_neg_tokens)}."
            return f"{sub} {aux}."

        # Fallback: Natural capitalized join with full stop
        cleaned = " ".join(tokens)
        return cleaned.capitalize() + "."


grammar_engine = ISLGrammarEngine()
