/**
 * The curated bilingual glossary at the centre of the Phase 3A prototype
 * (plan §16). Each entry maps a set of English / romanized-Hindi / Devanagari
 * surface forms to one abstract concept, its plain-language meaning, a coarse
 * role (for the ordering + non-manual-marker passes) and a list of DEVELOPMENT
 * gesture ids used to exercise the avatar.
 *
 * HONESTY — read this before touching anything else:
 *  - The `gestureIds` are the Phase 2D placeholder development animations
 *    (wave / raise-left / raise-right / open / close / point). They are generic
 *    motion primitives chosen to make the pipeline visible. They are NOT Indian
 *    Sign Language signs and must never be presented as such (plan §10, Rule #14).
 *  - This is a hand-authored word/concept list, NOT a trained ISL translator and
 *    NOT an authoritative ISL dictionary. Real ISL is a full language with
 *    grammar, space, mouthing and non-manual markers a flat glossary cannot
 *    capture. Coverage here is intentionally small and demonstrative.
 *  - A real, validated ISL lexicon + a proper sequence-mapping model is a future,
 *    dataset-backed concern. Swapping this array is the ONLY change that requires.
 */
import type { GlossaryEntry } from './types.js';

const G = (
  conceptId: string,
  forms: readonly string[],
  normalizedMeaning: string,
  role: GlossaryEntry['role'],
  gestureIds: readonly string[],
  facialExpression: GlossaryEntry['facialExpression'] = 'neutral',
  timingMs = 800,
): GlossaryEntry => ({ conceptId, forms, normalizedMeaning, role, gestureIds, facialExpression, timingMs });

export const DEFAULT_GLOSSARY: readonly GlossaryEntry[] = Object.freeze([
  // Politeness / social
  G('greet', ['hello', 'hi', 'namaste', 'नमस्ते', 'नमस्कार'], 'a greeting', 'politeness', ['sign-namaste'], 'affirmative', 950),
  G('thank', ['thank', 'thanks', 'thank you', 'shukriya', 'dhanyavad', 'धन्यवाद'], 'gratitude', 'politeness', ['sign-thank'], 'affirmative', 900),
  G('please', ['please', 'kripya', 'कृपया'], 'a polite request', 'politeness', ['sign-please'], 'neutral', 750),
  G('sorry', ['sorry', 'maaf', 'shama', 'क्षमा', 'माफ'], 'an apology', 'feeling', ['sign-sorry'], 'negative', 850),

  // Affirmation / negation
  G('yes', ['yes', 'haan', 'ha', 'ji', 'हाँ', 'हां', 'जी'], 'affirmation', 'other', ['sign-yes'], 'affirmative', 750),
  G('no', ['no', 'not', 'do not', 'does not', 'did not', "don't", "doesn't", "didn't", 'nahi', 'nahin', 'नहीं', 'नही'], 'negation / refusal', 'negation', ['sign-no'], 'negative', 750),

  // Pronouns / reference
  G('self', ['i', 'me', 'my', 'mine', 'main', 'mujhe', 'muje', 'मैं', 'मेरा', 'मुझे'], 'the speaker', 'pronoun', ['sign-self'], 'neutral', 650),
  G('you', ['you', 'your', 'yours', 'tum', 'aap', 'tom', 'तुम', 'आप', 'तुम्हारा'], 'the person addressed', 'pronoun', ['sign-you'], 'neutral', 650),
  G('we', ['we', 'us', 'our', 'hum', 'हम', 'हमारा'], 'the speaker and others', 'pronoun', ['open'], 'neutral', 600),
  G('demonstrative', ['this', 'that', 'these', 'those', 'ye', 'wo', 'यह', 'वह', 'ये', 'वो'], 'a pointed referent', 'other', ['point'], 'emphasis', 550),

  // Question words (drive question non-manual markers)
  G('who', ['who', 'kaun', 'कौन'], 'asking about a person', 'question', ['point'], 'question', 700),
  G('what', ['what', 'kya', 'क्या'], 'asking about a thing', 'question', ['raise-right'], 'question', 700),
  G('where', ['where', 'kahan', 'kahin', 'कहाँ', 'कहां'], 'asking about a place', 'question', ['sign-where'], 'question', 850),
  G('when', ['when', 'kab', 'कब'], 'asking about time', 'question', ['point'], 'question', 700),
  G('why', ['why', 'kyu', 'kyon', 'kyuon', 'क्यों'], 'asking about a reason', 'question', ['raise-right'], 'question', 700),
  G('how', ['how', 'kaise', 'कैसे'], 'asking about a manner', 'question', ['open'], 'question', 750),
  G('how-many', ['how much', 'how many', 'kitna', 'kitni', 'कितना', 'कितनी'], 'asking about amount', 'question', ['open'], 'question', 800),

  // Common verbs
  G('be', ['is', 'am', 'are', 'was', 'were', 'ho', 'hai', 'है', 'हूँ'], 'to exist / equate', 'verb', ['point'], 'neutral', 550),
  G('help', ['help', 'madad', 'मदद'], 'to assist', 'verb', ['sign-help'], 'neutral', 950),
  G('want', ['want', 'need', 'chahiye', 'chahe', 'चाहिए', 'चाह'], 'to desire or require', 'verb', ['open'], 'neutral', 800),
  G('go', ['go', 'went', 'went to', 'go to', 'going', 'going to', 'jao', 'jaana', 'जाओ', 'जाना'], 'to move away', 'verb', ['raise-right'], 'neutral', 800),
  G('come', ['come', 'came', 'came to', 'come to', 'coming', 'coming to', 'aao', 'ana', 'आओ', 'आना'], 'to move here', 'verb', ['close'], 'neutral', 800),
  G('understand', ['understand', 'samajh', 'samaj', 'समझ'], 'to comprehend', 'verb', ['point'], 'neutral', 850),
  G('know', ['know', 'jaanta', 'pata', 'पता', 'जानता'], 'to have knowledge', 'verb', ['point'], 'neutral', 750),
  G('see', ['see', 'look', 'dekh', 'देख', 'दिख'], 'to perceive visually', 'verb', ['raise-right'], 'neutral', 750),
  G('eat', ['eat', 'ate', 'eating', 'kha', 'khao', 'खाओ', 'खा'], 'to consume food', 'verb', ['sign-food'], 'neutral', 800),
  G('drink', ['drink', 'drinking', 'piyo', 'peena', 'पियो', 'पीना'], 'to consume liquid', 'verb', ['raise-right'], 'neutral', 700),
  G('call', ['call', 'phone', 'bulao', 'बुलाओ', 'कॉल'], 'to contact or summon', 'verb', ['raise-left'], 'neutral', 700),
  G('stop', ['stop', 'ruko', 'rukna', 'रुको', 'रुकना'], 'to halt movement', 'verb', ['sign-stop'], 'emphasis', 750),
  G('study', ['study', 'padhai', 'padho', 'पढ़ाई', 'पढ़ो'], 'to acquire knowledge', 'verb', ['point'], 'neutral', 750),
  G('pay', ['pay', 'payment', 'bhugtan', 'भुगतान'], 'to transfer funds', 'verb', ['open'], 'neutral', 700),

  // Nouns
  G('name', ['name', 'naam', 'नाम'], 'an identifier for a person', 'noun', ['point'], 'neutral', 700),
  G('water', ['water', 'paani', 'pani', 'पानी'], 'drinking water', 'noun', ['sign-water'], 'neutral', 850),
  G('food', ['food', 'khaana', 'khana', 'खाना'], 'something to eat', 'noun', ['sign-food'], 'neutral', 850),
  G('apple', ['apple', 'seb', 'सेब'], 'an apple fruit', 'noun', ['close'], 'neutral', 650),
  G('home', ['home', 'house', 'ghar', 'घर'], 'a dwelling', 'noun', ['sign-home'], 'neutral', 950),
  G('person', ['person', 'man', 'human', 'aadmi', 'insan', 'व्यक्ति', 'इंसान'], 'a human person', 'noun', ['sign-person'], 'neutral', 900),
  G('time', ['time', 'samay', 'waqt', 'समय', 'वक्त'], 'a measure of hours or moments', 'time', ['sign-time'], 'neutral', 900),
  G('friend', ['friend', 'dost', 'दोस्त'], 'a companion', 'noun', ['sign-friend'], 'affirmative', 750),
  G('family', ['family', 'parivaar', 'परिवार'], "one's relatives", 'noun', ['sign-family'], 'neutral', 850),
  G('school', ['school', 'vidyalaya', 'विद्यालय'], 'a place of learning', 'noun', ['sign-school'], 'neutral', 800),
  G('book', ['book', 'kitab', 'pustak', 'किताब', 'पुस्तक'], 'a written work', 'noun', ['open'], 'neutral', 700),
  G('teacher', ['teacher', 'guru', 'adhyapak', 'शिक्षक', 'अध्यापक'], 'an instructor', 'noun', ['raise-right'], 'neutral', 800),
  G('student', ['student', 'vidyarthi', 'chatra', 'विद्यार्थी', 'छात्र'], 'a learner', 'noun', ['point'], 'neutral', 750),

  // Family relations
  G('mother', ['mother', 'mom', 'maa', 'mata', 'माँ', 'माता'], 'female parent', 'noun', ['sign-mother'], 'affirmative', 750),
  G('father', ['father', 'dad', 'pita', 'papa', 'पिता', 'पापा'], 'male parent', 'noun', ['sign-father'], 'affirmative', 750),
  G('brother', ['brother', 'bhai', 'भाई'], 'male sibling', 'noun', ['point'], 'neutral', 700),
  G('sister', ['sister', 'behen', 'didi', 'बहन', 'दीदी'], 'female sibling', 'noun', ['point'], 'neutral', 700),

  // Healthcare
  G('doctor', ['doctor', 'chikitsak', 'डॉक्टर', 'चिकित्सक'], 'a medical doctor', 'noun', ['sign-doctor'], 'neutral', 750),
  G('hospital', ['hospital', 'aspataal', 'अस्पताल'], 'a hospital facility', 'noun', ['sign-hospital'], 'neutral', 800),
  G('medicine', ['medicine', 'dawa', 'dawakhana', 'दवा'], 'medical treatment', 'noun', ['close'], 'neutral', 700),
  G('pain', ['pain', 'dard', 'peeda', 'दर्द', 'पीड़ा'], 'physical discomfort', 'feeling', ['close'], 'negative', 750),
  G('sick', ['sick', 'ill', 'bimaar', 'bimar', 'बीमार'], 'unhealthy state', 'adjective', ['close'], 'negative', 750),

  // Emergency
  G('emergency', ['emergency', 'aapatkaal', 'aapat', 'आपातकाल'], 'an urgent crisis', 'noun', ['raise-right'], 'emphasis', 850),
  G('police', ['police', 'pulis', 'पुलिस'], 'law enforcement', 'noun', ['point'], 'neutral', 750),
  G('fire', ['fire', 'aag', 'आग'], 'a fire hazard', 'noun', ['wave'], 'emphasis', 750),
  G('danger', ['danger', 'khatra', 'खतरा'], 'a hazard or peril', 'noun', ['close'], 'negative', 800),

  // Banking & money
  G('money', ['money', 'cash', 'paisa', 'paise', 'rupaye', 'पैसा', 'पैसे', 'रुपये'], 'currency / funds', 'noun', ['open'], 'neutral', 700),
  G('bank', ['bank', 'baink', 'बैंक'], 'a financial institution', 'noun', ['point'], 'neutral', 750),
  G('cost', ['cost', 'price', 'keemat', 'daam', 'कीमत', 'दाम'], 'monetary value', 'noun', ['point'], 'neutral', 700),

  // Adjectives / feelings
  G('good', ['good', 'accha', 'acha', 'अच्छा'], 'positive quality', 'adjective', ['open'], 'affirmative', 650),
  G('bad', ['bad', 'bura', 'buri', 'बुरा'], 'negative quality', 'adjective', ['close'], 'negative', 650),
  G('happy', ['happy', 'khush', 'prasann', 'खुश', 'प्रसन्न'], 'a joyful feeling', 'feeling', ['sign-happy'], 'affirmative', 800),
  G('sad', ['sad', 'dukh', 'दुख', 'दुःख'], 'a sorrowful feeling', 'feeling', ['sign-sad'], 'negative', 800),

  // Time / place / directions
  G('yesterday', ['yesterday', 'beeta kal'], 'the previous day', 'time', ['raise-left'], 'neutral', 700),
  G('today', ['today', 'aaj', 'आज'], 'the current day', 'time', ['point'], 'neutral', 600),
  G('tomorrow', ['tomorrow', 'kal', 'कल'], 'the next day', 'time', ['raise-right'], 'neutral', 700),
  G('now', ['now', 'ab', 'अभी'], 'this moment', 'time', ['point'], 'emphasis', 550),
  G('late', ['late', 'der', 'देर'], 'after the expected time', 'time', ['raise-left'], 'neutral', 700),
  G('place', ['here', 'there', 'yahan', 'wahan', 'यहाँ', 'वहाँ'], 'a location', 'place', ['point'], 'neutral', 650),
  G('left', ['left', 'baayein', 'baayan', 'बाएं'], 'towards the left', 'place', ['raise-left'], 'neutral', 600),
  G('right', ['right', 'daayein', 'daayan', 'दाएं'], 'towards the right', 'place', ['raise-right'], 'neutral', 600),
  G('straight', ['straight', 'seedhe', 'seedha', 'सीधे'], 'moving ahead', 'place', ['point'], 'neutral', 600),
  G('near', ['near', 'paas', 'पास'], 'short distance away', 'place', ['point'], 'neutral', 600),
  G('far', ['far', 'door', 'dur', 'दूर'], 'long distance away', 'place', ['point'], 'neutral', 650),
  G('monday', ['monday', 'somwar', 'somvaar', 'सोमवार'], 'the first day of work week', 'time', ['sign-monday'], 'neutral', 800),
  G('night', ['night', 'raat', 'ratri', 'रात', 'रात्रि'], 'the time of darkness', 'time', ['sign-night'], 'neutral', 800),
  G('street', ['street', 'road', 'sadak', 'सड़क', 'रास्ता'], 'a public thoroughfare', 'place', ['sign-street'], 'neutral', 750),
  G('shoe', ['shoe', 'shoes', 'joota', 'joote', 'जूता', 'जूते'], 'footwear', 'noun', ['sign-shoe'], 'neutral', 700),
  G('yellow', ['yellow', 'peela', 'pila', 'पीला'], 'yellow color', 'adjective', ['sign-yellow'], 'neutral', 650),
  G('how-are-you', ['how are you', 'how r u', 'aap kaise hain', 'kya haal hai', 'आप कैसे हैं', 'क्या हाल है'], 'inquiry into well-being', 'politeness', ['sign-how-are-you'], 'question', 900),

  G('and', ['and', 'aur', 'और'], 'addition', 'connector', ['open'], 'neutral', 500),
  G('but', ['but', 'lekin', 'par', 'लेकिन', 'पर'], 'contrast', 'connector', ['close'], 'neutral', 550),

  // Extended ISL 28 Dynamic Vocabulary (Phase 4 / Phase 5 scope)
  G('girl', ['girl', 'ladki', 'kanya', 'लड़की', 'कन्या'], 'a female child / youth', 'noun', ['sign-girl'], 'affirmative', 750),
  G('child', ['child', 'kid', 'children', 'bachha', 'bacha', 'बच्चा', 'बालक'], 'a young human', 'noun', ['sign-child'], 'affirmative', 700),
  G('dog', ['dog', 'kutta', 'kuttae', 'कुत्ता', 'श्वान'], 'a domestic canine', 'noun', ['sign-dog'], 'neutral', 700),
  G('park', ['park', 'garden', 'bagicha', 'बगीचा', 'पार्क'], 'a public green space', 'place', ['sign-park'], 'neutral', 800),
  G('market', ['market', 'bazaar', 'bazar', 'बाज़ार', 'बाजार', 'मंडी'], 'a public marketplace', 'place', ['sign-market'], 'neutral', 800),
  G('city', ['city', 'town', 'shahar', 'nagar', 'शहर', 'नगर'], 'an urban municipality', 'place', ['sign-city'], 'neutral', 850),
  G('shirt', ['shirt', 'kameez', 'kamiz', 'कमीज़', 'शर्ट'], 'an upper body garment', 'noun', ['sign-shirt'], 'neutral', 750),
  G('dress', ['dress', 'clothes', 'clothing', 'kapde', 'कपड़े', 'पोशाक'], 'attire / clothing', 'noun', ['sign-dress'], 'neutral', 800),
  G('hat', ['hat', 'cap', 'topi', 'टोपी'], 'headwear', 'noun', ['sign-hat'], 'neutral', 700),
  G('black', ['black', 'kaala', 'kala', 'काला'], 'black color', 'adjective', ['sign-black'], 'neutral', 650),
  G('heavy', ['heavy', 'bhaari', 'bhari', 'wazani', 'भारी', 'वज़नी'], 'great weight or burden', 'adjective', ['sign-heavy'], 'emphasis', 750),
  G('stand', ['stand', 'standing', 'khade', 'khada', 'खड़े', 'खड़ा'], 'to be on feet', 'verb', ['sign-stand'], 'neutral', 750),
  G('walk', ['walk', 'walking', 'chalo', 'chalna', 'चलो', 'चलना', 'घूमना'], 'to advance on foot', 'verb', ['sign-walk'], 'neutral', 800),
]);


/** concept id → entry, built once for O(1) lookups in tests / the UI legend. */
export const GLOSSARY_BY_CONCEPT: Readonly<Record<string, GlossaryEntry>> = Object.freeze(
  Object.fromEntries(DEFAULT_GLOSSARY.map((e) => [e.conceptId, e])),
);
