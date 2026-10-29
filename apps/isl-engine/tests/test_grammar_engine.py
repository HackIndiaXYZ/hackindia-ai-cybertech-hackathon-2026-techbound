"""
Unit tests for the Rule-Based ISL SOV->SVO Grammar Engine and Sentence Formatter.
Phase 2: Verifying sentence formation across happy path, edge cases, and vocabulary mappings.
"""

import sys, os
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from grammar_engine import grammar_engine, ISLGrammarEngine
from sentence_model import build_sentence, ISLConverter

class TestISLGrammarEngine:
    def test_initialization_honesty(self):
        engine = ISLGrammarEngine()
        assert engine.name == "isl-rule-based-grammar-v1"
        assert engine.trained is False  # Never misrepresent rule-based heuristics as trained models

    # --- Happy Paths (Common ISL SOV Patterns) ---
    def test_sov_time_subject_location(self):
        # [I, School, Monday] -> 'I go to school on Monday.'
        res = grammar_engine.format_sentence(["I", "School", "Monday"])
        assert res == "I go to school on Monday."

        # String input variation
        res_str = grammar_engine.format_sentence("I School Monday")
        assert res_str == "I go to school on Monday."

    def test_sov_subject_location_father_hospital(self):
        # [Father, Hospital] -> 'Father goes to the hospital.'
        res = grammar_engine.format_sentence(["Father", "Hospital"])
        assert res == "Father goes to the hospital."

    def test_sov_doctor_hospital(self):
        # Doctor at hospital
        res = grammar_engine.format_sentence(["Doctor", "Hospital"])
        assert res == "The doctor is at the hospital."

    def test_sov_dog_park(self):
        # Dog in park
        res = grammar_engine.format_sentence(["Dog", "Park"])
        assert res == "The dog is in the park."

    def test_sov_subject_clothing_color(self):
        # [He, Black, Shirt] -> 'He is wearing a black shirt.'
        res = grammar_engine.format_sentence(["He", "Black", "Shirt"])
        assert res == "He is wearing a black shirt."

    def test_sov_girl_yellow_dress(self):
        # [Girl, Yellow, Dress] -> 'The girl is wearing a yellow dress.'
        res = grammar_engine.format_sentence(["Girl", "Yellow", "Dress"])
        assert res == "The girl is wearing a yellow dress."

    def test_compound_subjects_and_adjective(self):
        # [Doctor, Child, Happy] -> 'The doctor and the child are happy.'
        res = grammar_engine.format_sentence(["Doctor", "Child", "Happy"])
        assert res == "The doctor and the child are happy."

    def test_location_in_location(self):
        # [Market, City] -> 'The Market is in the city.'
        res = grammar_engine.format_sentence(["Market", "City"])
        assert res == "The Market is in the city."

    def test_conversational_and_greetings(self):
        assert grammar_engine.format_sentence(["Thank You"]) == "Thank you."
        assert grammar_engine.format_sentence(["Thank_You"]) == "Thank you."
        assert grammar_engine.format_sentence("How_Are_You_") == "How are you?"
        assert grammar_engine.format_sentence(["I", "Thank You"]) == "I thank you."

    # --- Fingerspelling / Alphabet Sequences ---
    def test_fingerspelling_merge(self):
        # Consecutive single letters should merge into capitalized words
        assert grammar_engine.format_sentence(["H", "E", "L", "L", "O"]) == "Hello."
        assert grammar_engine.format_sentence(["C", "A", "T"]) == "Cat."
        assert grammar_engine.format_sentence("H E L L O") == "Hello."

    # --- Ambiguous, Short, and Edge Cases ---
    def test_single_word_gloss(self):
        # Single noun without verb
        assert grammar_engine.format_sentence(["Hospital"]) == "Hospital."
        assert grammar_engine.format_sentence("School") == "School."

    def test_single_adjective(self):
        # Single adjective
        assert grammar_engine.format_sentence(["Happy"]) == "Happy."

    def test_empty_and_whitespace(self):
        assert grammar_engine.format_sentence("") == ""
        assert grammar_engine.format_sentence([]) == ""
        assert grammar_engine.format_sentence("   ") == ""
        assert grammar_engine.format_sentence([None]) == ""

    def test_unrecognized_tokens_graceful_fallback(self):
        # Out-of-vocabulary tokens should not crash, but format cleanly
        res = grammar_engine.format_sentence(["Airplane", "Sky"])
        assert res == "Airplane sky."

    # --- Expanded Grammar: Negation Handling ---
    def test_negation_verb(self):
        assert grammar_engine.format_sentence(["I", "Understand", "Not"]) == "I do not understand."
        assert grammar_engine.format_sentence(["He", "Go", "School", "Not"]) == "He does not go to school."

    def test_negation_desire_and_ingestion(self):
        assert grammar_engine.format_sentence(["I", "Water", "Want", "Not"]) == "I do not want water."
        assert grammar_engine.format_sentence(["She", "Food", "Eat", "Not"]) == "She does not eat food."

    def test_negation_adjective_copula(self):
        assert grammar_engine.format_sentence(["Child", "Happy", "Not"]) == "The child is not happy."
        assert grammar_engine.format_sentence(["I", "Sick", "Not"]) == "I am not sick."

    # --- Expanded Grammar: WH-Question Placement ---
    def test_wh_question_what(self):
        assert grammar_engine.format_sentence(["You", "Name", "What"]) == "What is your name?"
        assert grammar_engine.format_sentence(["Time", "What"]) == "What time is it?"

    def test_wh_question_where(self):
        assert grammar_engine.format_sentence(["Hospital", "Where"]) == "Where is the hospital?"
        assert grammar_engine.format_sentence(["You", "Live", "Where"]) == "Where do you live?"
        assert grammar_engine.format_sentence(["You", "Go", "Where"]) == "Where are you going?"

    def test_wh_question_who(self):
        assert grammar_engine.format_sentence(["Doctor", "Who"]) == "Who is the doctor?"

    # --- Expanded Grammar: SOV -> SVO with Nouns & Verbs ---
    def test_sov_svo_food_and_drink(self):
        assert grammar_engine.format_sentence(["I", "Water", "Want"]) == "I want water."
        assert grammar_engine.format_sentence(["She", "Food", "Eat"]) == "She eats food."

    def test_sov_svo_help_and_requests(self):
        assert grammar_engine.format_sentence(["I", "Help", "Need"]) == "I need help."
        assert grammar_engine.format_sentence(["You", "Help", "Me"]) == "Please help me."

    def test_conversational_expanded(self):
        assert grammar_engine.format_sentence(["Namaste"]) == "Namaste."
        assert grammar_engine.format_sentence(["Sorry"]) == "I am sorry."
        assert grammar_engine.format_sentence(["Please"]) == "Please."
        assert grammar_engine.format_sentence(["Yes"]) == "Yes."
        assert grammar_engine.format_sentence(["No"]) == "No."

class TestSentenceModelIntegration:
    def test_build_sentence_with_string(self):
        res = build_sentence("I School Monday")
        assert res == "I go to school on Monday."

    def test_build_sentence_with_list(self):
        res = build_sentence(["Father", "Hospital"])
        assert res == "Father goes to the hospital."

    def test_build_sentence_negation(self):
        res = build_sentence(["I", "Water", "Want", "Not"])
        assert res == "I do not want water."

    def test_build_sentence_question(self):
        res = build_sentence(["Hospital", "Where"])
        assert res == "Where is the hospital?"

    def test_isl_converter_wrapper(self):
        converter = ISLConverter()
        assert converter.convert_to_english("Dog Park") == "The dog is in the park."
        assert converter.convert_to_english(["You", "Name", "What"]) == "What is your name?"

