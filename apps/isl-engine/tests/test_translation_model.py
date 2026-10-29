"""
Unit tests for the IndianLanguageTranslator.
Verifies offline translations, dictionary fallbacks, multi-language mappings, and resilience.
"""

import sys, os
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from translation_model import IndianLanguageTranslator, translate_text, OFFLINE_DICTIONARY

class TestIndianLanguageTranslator:
    @pytest.fixture
    def translator(self):
        return IndianLanguageTranslator()

    def test_supported_languages(self, translator):
        langs = translator.get_all_languages()
        assert "hi" in langs
        assert "pa" in langs
        assert "bn" in langs
        assert "gu" in langs
        assert "mr" in langs

    def test_offline_dictionary_coverage(self, translator):
        # Exact sentence offline dictionary match in Hindi
        hi_res = translator.translate_offline("Thank you.", "hi")
        assert hi_res == "धन्यवाद।"

        # Exact sentence in Bengali
        bn_res = translator.translate_offline("How are you?", "bn")
        assert bn_res == "আপনি কেমন আছেন?"

        # Question translation in Hindi
        name_hi = translator.translate_offline("What is your name?", "hi")
        assert name_hi == "आपका नाम क्या है?"

        # Help request in Hindi
        help_hi = translator.translate_offline("Please help me.", "hi")
        assert help_hi == "कृपया मेरी मदद करें।"

    def test_translate_text_wrapper(self):
        res = translate_text("Namaste.", "hi")
        assert res == "नमस्ते।"

    def test_translate_all_languages_structure(self, translator):
        res = translator.translate_all_languages("Thank you.")
        assert "English" in res
        assert "Hindi (हिंदी)" in res
        assert res["Hindi (हिंदी)"] == "धन्यवाद।"
        assert "Bengali (বাংলা)" in res

    def test_empty_and_whitespace(self, translator):
        assert translator.translate("", "hi") == ""
        assert translator.translate("   ", "hi") == ""

    def test_offline_word_glossary_fallback(self, translator):
        assert translator.translate_offline("water", "hi") == "पानी"
        assert translator.translate_offline("hospital", "hi") == "अस्पताल"
        assert translator.translate_offline("doctor", "hi") == "डॉक्टर"
