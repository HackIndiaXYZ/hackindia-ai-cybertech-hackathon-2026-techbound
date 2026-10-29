"""
English to Indian Language Translation Module
Supports:
1. Self-hosted / on-device local translation microservice (e.g. IndicTrans2 / NLLB) via TRANSLATION_SERVICE_URL
2. Fallback to free Google Translate API
3. Zero-latency offline dictionary & phrase mapper for core ISL vocabulary and conversational sentences
"""

import os
import requests
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

# Built-in offline translations for core ISL vocabulary and common sentences across Indian languages
OFFLINE_DICTIONARY: Dict[str, Dict[str, str]] = {
    "i go to school on monday.": {
        "hi": "मैं सोमवार को स्कूल जाता हूँ।",
        "pa": "ਮੈਂ ਸੋਮਵਾਰ ਨੂੰ ਸਕੂਲ ਜਾਂਦਾ ਹਾਂ।",
        "bn": "আমি সোমবারে স্কুলে যাই।",
        "gu": "હું સોમવારે શાળાએ જાઉં છું.",
        "mr": "मी सोमवारी शाळेत जातो.",
    },
    "father goes to the hospital.": {
        "hi": "पिताजी अस्पताल जाते हैं।",
        "pa": "ਪਿਤਾ ਜੀ ਹਸਪਤਾਲ ਜਾਂਦੇ ਹਨ।",
        "bn": "বাবা হাসপাতালে যান।",
        "gu": "પિતાજી હોસ્પિટલ જાય છે.",
        "mr": "वडील रुग्णालयात जातात.",
    },
    "the doctor is at the hospital.": {
        "hi": "डॉक्टर अस्पताल में हैं।",
        "pa": "ਡਾਕਟਰ ਹਸਪਤਾਲ ਵਿੱਚ ਹਨ।",
        "bn": "ডাক্তার হাসপাতালে আছেন।",
        "gu": "ડોક્ટર હોસ્પિટલમાં છે.",
        "mr": "डॉक्टर रुग्णालयात आहेत.",
    },
    "the dog is in the park.": {
        "hi": "कुत्ता पार्क में है।",
        "pa": "ਕੁੱਤਾ ਪਾਰਕ ਵਿੱਚ ਹੈ।",
        "bn": "কুকুরটি পার্কে আছে।",
        "gu": "કૂતરો બગીચામાં છે.",
        "mr": "कुत्रा बागेत आहे.",
    },
    "he is wearing a black shirt.": {
        "hi": "उसने काली कमीज पहनी है।",
        "pa": "ਉਸਨੇ ਕਾਲੀ ਕਮੀਜ਼ ਪਾਈ ਹੋਈ ਹੈ।",
        "bn": "সে কালো শার্ট পরেছে।",
        "gu": "તેણે કાળું શર્ટ પહેર્યું છે.",
        "mr": "त्याने काळा शर्ट घातला आहे.",
    },
    "the girl is wearing a yellow dress.": {
        "hi": "लड़की ने पीली पोशाक पहनी है।",
        "pa": "ਕੁੜੀ ਨੇ ਪੀਲੀ ਪੋਸ਼ਾਕ ਪਾਈ ਹੋਈ ਹੈ।",
        "bn": "মেয়েটি হলুদ পোশাক পরেছে।",
        "gu": "છોકરીએ પીળો ડ્રેસ પહેર્યો છે.",
        "mr": "मुलीने पिवळा ड्रेस घातला आहे.",
    },
    "the doctor and the child are happy.": {
        "hi": "डॉक्टर और बच्चा खुश हैं।",
        "pa": "ਡਾਕਟਰ ਅਤੇ ਬੱਚਾ ਖੁਸ਼ ਹਨ।",
        "bn": "ডাক্তার এবং শিশুটি খুশি।",
        "gu": "ડોક્ટર અને બાળક ખુશ છે.",
        "mr": "डॉक्टर आणि मूल आनंदी आहेत.",
    },
    "the child is happy.": {
        "hi": "बच्चा खुश है।",
        "pa": "ਬੱਚਾ ਖੁਸ਼ ਹੈ।",
        "bn": "শিশু খুশি।",
        "gu": "બાળક ખુશ છે.",
        "mr": "मूल आनंदी आहे.",
    },
    "thank you.": {
        "hi": "धन्यवाद।",
        "pa": "ਧੰਨਵਾਦ।",
        "bn": "ধন্যবাদ।",
        "gu": "આભાર.",
        "mr": "धन्यवाद.",
    },
    "i thank you.": {
        "hi": "मैं आपका धन्यवाद करता हूँ।",
        "pa": "ਮੈਂ ਤੁਹਾਡਾ ਧੰਨਵਾਦ ਕਰਦਾ ਹਾਂ।",
        "bn": "আমি আপনাকে ধন্যবাদ জানাই।",
        "gu": "હું તમારો આભાર માનું છું.",
        "mr": "मी तुमचे आभार मानतो.",
    },
    "how are you?": {
        "hi": "आप कैसे हैं?",
        "pa": "ਤੁਸੀਂ ਕਿਵੇਂ ਹੋ?",
        "bn": "আপনি কেমন আছেন?",
        "gu": "તમે કેમ છો?",
        "mr": "तुम्ही कसे आहात?",
    },
    "namaste.": {
        "hi": "नमस्ते।",
        "pa": "ਨਮਸਤੇ।",
        "bn": "নমস্কার।",
        "gu": "નમસ્તે.",
        "mr": "नमस्ते.",
    },
    "hello.": {
        "hi": "नमस्ते।",
        "pa": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ।",
        "bn": "হ্যালো।",
        "gu": "હેલો.",
        "mr": "नमस्कार.",
    },
    "i am sorry.": {
        "hi": "मुझे खेद है।",
        "pa": "ਮੈਨੂੰ ਅਫਸੋਸ ਹੈ।",
        "bn": "আমি দুঃখিত।",
        "gu": "મને માફ કરશો.",
        "mr": "मला माफ करा.",
    },
    "please.": {
        "hi": "कृपया।",
        "pa": "ਕਿਰਪਾ ਕਰਕੇ।",
        "bn": "দয়া করে।",
        "gu": "કૃપા કરીને.",
        "mr": "कृपया.",
    },
    "yes.": {
        "hi": "हाँ।",
        "pa": "ਹਾਂ।",
        "bn": "হ্যাঁ।",
        "gu": "હા.",
        "mr": "होय.",
    },
    "no.": {
        "hi": "नहीं।",
        "pa": "ਨਹੀਂ।",
        "bn": "না।",
        "gu": "ના.",
        "mr": "नाही.",
    },
    "help.": {
        "hi": "मदद।",
        "pa": "ਮਦਦ।",
        "bn": "সাহায্য।",
        "gu": "મદદ.",
        "mr": "मदत.",
    },
    "please help me.": {
        "hi": "कृपया मेरी मदद करें।",
        "pa": "ਕਿਰਪਾ ਕਰਕੇ ਮੇਰੀ ਮਦਦ ਕਰੋ।",
        "bn": "দয়া করে আমাকে সাহায্য করুন।",
        "gu": "કૃપા કરીને મને મદદ કરો.",
        "mr": "कृपया मला मदत करा.",
    },
    "i need help.": {
        "hi": "मुझे मदद चाहिए।",
        "pa": "ਮੈਨੂੰ ਮਦਦ ਚਾਹੀਦੀ ਹੈ।",
        "bn": "আমার সাহায্য দরকার।",
        "gu": "મને મદદની જરૂર છે.",
        "mr": "मला मदतीची गरज आहे.",
    },
    "i want water.": {
        "hi": "मुझे पानी चाहिए।",
        "pa": "ਮੈਨੂੰ ਪਾਣੀ ਚਾਹੀਦਾ ਹੈ।",
        "bn": "আমি জল চাই।",
        "gu": "મને પાણી જોઈએ છે.",
        "mr": "मला पाणी हवे आहे.",
    },
    "i do not want water.": {
        "hi": "मुझे पानी नहीं चाहिए।",
        "pa": "ਮੈਨੂੰ ਪਾਣੀ ਨਹੀਂ ਚਾਹੀਦਾ।",
        "bn": "আমি জল চাই না।",
        "gu": "મને પાણી નથી જોઈતું.",
        "mr": "मला पाणी नको आहे.",
    },
    "what is your name?": {
        "hi": "आपका नाम क्या है?",
        "pa": "ਤੁਹਾਡਾ ਨਾਮ ਕੀ ਹੈ?",
        "bn": "আপনার নাম কি?",
        "gu": "તમારું નામ શું છે?",
        "mr": "तुमचे नाव काय आहे?",
    },
    "where is the hospital?": {
        "hi": "अस्पताल कहाँ है?",
        "pa": "ਹਸਪਤਾਲ ਕਿੱਥੇ ਹੈ?",
        "bn": "হাসপাতাল কোথায়?",
        "gu": "હોસ્પિટલ ક્યાં છે?",
        "mr": "रुग्णालय कुठे आहे?",
    },
    "where do you live?": {
        "hi": "आप कहाँ रहते हैं?",
        "pa": "ਤੁਸੀਂ ਕਿੱਥੇ ਰਹਿੰਦੇ ਹੋ?",
        "bn": "আপনি কোথায় থাকেন?",
        "gu": "તમે ક્યાં રહો છો?",
        "mr": "तुम्ही कुठे राहता?",
    },
    "what time is it?": {
        "hi": "क्या समय हुआ है?",
        "pa": "ਕੀ ਸਮਾਂ ਹੋਇਆ ਹੈ?",
        "bn": "এখন কয়টা বাজে?",
        "gu": "કેટલા વાગ્યા છે?",
        "mr": "किती वाजले आहेत?",
    },
    "who is the doctor?": {
        "hi": "डॉक्टर कौन हैं?",
        "pa": "ਡਾਕਟਰ ਕੌਣ ਹਨ?",
        "bn": "ডাক্তার কে?",
        "gu": "ડોક્ટર કોણ છે?",
        "mr": "डॉक्टर कोण आहेत?",
    },
}

# Single-word vocabulary glossary
OFFLINE_WORD_GLOSSARY: Dict[str, Dict[str, str]] = {
    "water": {"hi": "पानी", "pa": "ਪਾਣੀ", "bn": "জল", "gu": "પાણી", "mr": "पाणी"},
    "food": {"hi": "भोजन", "pa": "ਭੋਜਨ", "bn": "খাবার", "gu": "ખોરાક", "mr": "अन्न"},
    "tea": {"hi": "चाय", "pa": "ਚਾਹ", "bn": "চা", "gu": "ચા", "mr": "चहा"},
    "school": {"hi": "स्कूल", "pa": "ਸਕੂਲ", "bn": "স্কুল", "gu": "શાળા", "mr": "शाळा"},
    "hospital": {"hi": "अस्पताल", "pa": "ਹਸਪਤਾਲ", "bn": "হাসপাতাল", "gu": "હોસ્પિટલ", "mr": "रुग्णालय"},
    "park": {"hi": "पार्क", "pa": "ਪਾਰਕ", "bn": "পার্ক", "gu": "બગીચો", "mr": "बाग"},
    "market": {"hi": "बाजार", "pa": "ਬਾਜ਼ਾਰ", "bn": "বাজার", "gu": "બજાર", "mr": "बाजार"},
    "city": {"hi": "शहर", "pa": "ਸ਼ਹਿਰ", "bn": "শহর", "gu": "શહેર", "mr": "शहर"},
    "home": {"hi": "घर", "pa": "ਘਰ", "bn": "বাড়ি", "gu": "ઘર", "mr": "घर"},
    "dog": {"hi": "कुत्ता", "pa": "ਕੁੱਤਾ", "bn": "কুকুর", "gu": "કૂતરો", "mr": "कुत्रा"},
    "doctor": {"hi": "डॉक्टर", "pa": "ਡਾਕਟਰ", "bn": "ডাক্তার", "gu": "ડોક્ટર", "mr": "डॉक्टर"},
    "father": {"hi": "पिता", "pa": "ਪਿਤਾ", "bn": "বাবা", "gu": "પિતા", "mr": "वडील"},
    "mother": {"hi": "माता", "pa": "ਮਾਤਾ", "bn": "মা", "gu": "માતા", "mr": "आई"},
    "happy": {"hi": "खुश", "pa": "ਖੁਸ਼", "bn": "খুশি", "gu": "ખુશ", "mr": "आनंदी"},
    "help": {"hi": "मदद", "pa": "ਮਦਦ", "bn": "সাহায্য", "gu": "મદદ", "mr": "मदत"},
}


class IndianLanguageTranslator:
    """
    Self-contained Indian Language Translator with offline fallback.
    Supports local self-hosted translation microservice, online Google Translate API,
    and built-in offline lexical/phrase translation.
    """

    LANGUAGE_CODES = {
        "hi": "Hindi (हिंदी)",
        "pa": "Punjabi (ਪੰਜਾਬੀ)",
        "bn": "Bengali (বাংলা)",
        "gu": "Gujarati (ગુજરાતી)",
        "mr": "Marathi (मराठी)",
    }

    TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"

    def __init__(self, service_url: Optional[str] = None):
        """Initialize translator with optional self-hosted service endpoint."""
        self.service_url = service_url or os.getenv("TRANSLATION_SERVICE_URL")
        print("[Translator] [OK] Indian Language Translator initialized!")
        print(f"[Translator] [OK] Supported languages: {len(self.LANGUAGE_CODES)}")
        if self.service_url:
            print(f"[Translator] [OK] Self-hosted service configured: {self.service_url}")
        else:
            print("[Translator] [OK] Running in hybrid mode (Network + Offline local dictionary)")
        print()

    def translate_offline(self, text: str, target_language: str) -> Optional[str]:
        """Looks up text in built-in offline phrase and word dictionary."""
        cleaned = text.strip().lower()
        if cleaned in OFFLINE_DICTIONARY and target_language in OFFLINE_DICTIONARY[cleaned]:
            return OFFLINE_DICTIONARY[cleaned][target_language]

        # Single word lookup
        word_key = cleaned.rstrip(".!?")
        if word_key in OFFLINE_WORD_GLOSSARY and target_language in OFFLINE_WORD_GLOSSARY[word_key]:
            return OFFLINE_WORD_GLOSSARY[word_key][target_language]

        return None

    def translate(self, text: str, target_language: str, **kwargs) -> str:
        """
        Translate English text to target Indian language.
        Tries:
        1. Local self-hosted translation service (if configured)
        2. Free Google Translate API (fast timeout: 2.5s)
        3. Built-in deterministic offline dictionary
        4. Safe text fallback
        """
        if not text or not text.strip():
            return ""

        if target_language not in self.LANGUAGE_CODES:
            target_language = "hi"

        # Check offline dictionary first for exact matches
        offline_match = self.translate_offline(text, target_language)
        if offline_match:
            return offline_match

        # Strategy 1: Self-hosted / local microservice (IndicTrans2 / NLLB)
        if self.service_url:
            try:
                res = requests.post(
                    f"{self.service_url.rstrip('/')}/translate",
                    json={"text": text, "source_lang": "en", "target_lang": target_language},
                    timeout=3.0,
                )
                if res.status_code == 200:
                    data = res.json()
                    translated = data.get("translated_text") or data.get("translation")
                    if translated:
                        return str(translated)
            except Exception:
                pass  # Fall through to Google Translate / offline

        # Strategy 2: Google Translate API
        try:
            params = {
                'client': 'gtx',
                'sl': 'en',
                'tl': target_language,
                'dt': 't',
                'q': text,
            }
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            response = requests.get(
                self.TRANSLATE_URL,
                params=params,
                headers=headers,
                timeout=2.5,
            )

            if response.status_code == 200:
                result = response.json()
                translated = result[0][0][0]
                return translated
        except Exception:
            pass

        # Strategy 3: Offline fallback
        return offline_match if offline_match else text

    def translate_all_languages(self, text: str) -> Dict[str, str]:
        """Translate to all supported Indian languages."""
        translations = {"English": text}
        for lang_code, lang_name in self.LANGUAGE_CODES.items():
            translation = self.translate(text, lang_code)
            translations[lang_name] = translation
        return translations

    def get_all_languages(self) -> Dict[str, str]:
        """Get all supported languages."""
        return self.LANGUAGE_CODES

    def batch_translate(self, texts: List[str], target_language: str) -> List[str]:
        """Translate multiple texts."""
        return [self.translate(text, target_language) for text in texts]


translator = IndianLanguageTranslator()


def translate_text(sentence: str, language: str) -> str:
    """Wrapper function used by Flask backend."""
    return translator.translate(sentence, language)


if __name__ == '__main__':
    print("=" * 70)
    print("TESTING INDIAN LANGUAGE TRANSLATOR (ONLINE & OFFLINE)")
    print("=" * 70)
    print()

    test_sentences = [
        "I go to school on Monday.",
        "Thank you.",
        "How are you?",
        "Please help me.",
        "I want water.",
        "What is your name?",
    ]

    for sentence in test_sentences:
        print(f"English: {sentence}")
        for lang_code, lang_name in translator.LANGUAGE_CODES.items():
            translation = translate_text(sentence, lang_code)
            print(f"  {lang_name}: {translation}")
        print()
