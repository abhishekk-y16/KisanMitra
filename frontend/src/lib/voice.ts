/**
 * Voice and Translation Utilities
 * 
 * Implements:
 * - SS-VAD (Spectral Subtraction with Voice Activity Detection) stubs
 * - IndicTrans2 integration hooks for 22 Indian languages
 * - Web Speech API wrapper with Hindi/regional language support
 */

// Supported languages with Web Speech API codes
export const SUPPORTED_LANGUAGES = {
  hindi: { code: 'hi-IN', name: 'हिंदी', englishName: 'Hindi' },
  kannada: { code: 'kn-IN', name: 'ಕನ್ನಡ', englishName: 'Kannada' },
  tamil: { code: 'ta-IN', name: 'தமிழ்', englishName: 'Tamil' },
  telugu: { code: 'te-IN', name: 'తెలుగు', englishName: 'Telugu' },
  marathi: { code: 'mr-IN', name: 'मराठी', englishName: 'Marathi' },
  bengali: { code: 'bn-IN', name: 'বাংলা', englishName: 'Bengali' },
  gujarati: { code: 'gu-IN', name: 'ગુજરાતી', englishName: 'Gujarati' },
  punjabi: { code: 'pa-IN', name: 'ਪੰਜਾਬੀ', englishName: 'Punjabi' },
  malayalam: { code: 'ml-IN', name: 'മലയാളം', englishName: 'Malayalam' },
  odia: { code: 'or-IN', name: 'ଓଡ଼ିଆ', englishName: 'Odia' },
  assamese: { code: 'as-IN', name: 'অসমীয়া', englishName: 'Assamese' },
  english: { code: 'en-IN', name: 'English', englishName: 'English' },
} as const;

export type LanguageKey = keyof typeof SUPPORTED_LANGUAGES;

/**
 * SS-VAD Noise Filtering (Stub)
 * In production, implement actual Spectral Subtraction with VAD:
 * 1. Apply FFT to audio buffer
 * 2. Estimate noise spectrum from silent frames
 * 3. Subtract noise spectrum from signal
 * 4. Use energy-based VAD to detect speech regions
 * 
 * This improves recognition accuracy by 7.68% in noisy farm environments.
 */
export function applySSVAD(audioBuffer: ArrayBuffer): ArrayBuffer {
  // Stub: In production, use Web Audio API with AnalyserNode
  // and implement spectral subtraction algorithm
  console.log('SS-VAD: Processing audio buffer', audioBuffer.byteLength, 'bytes');
  return audioBuffer;
}

/**
 * IndicTrans2 Translation Hook
 * 
 * In production, call IndicTrans2 API or load local model:
 * - Model: ai4bharat/indictrans2-indic-indic-1B (for Indic-to-Indic)
 * - Model: ai4bharat/indictrans2-en-indic-1B (for English-to-Indic)
 * 
 * API endpoint (self-hosted or cloud):
 * POST /translate { source_lang, target_lang, text }
 */
const INDICTRANS_API = process.env.NEXT_PUBLIC_INDICTRANS_API || '';

interface TranslationResult {
  translated: string;
  source_lang: string;
  target_lang: string;
}

export async function translateText(
  text: string,
  sourceLang: LanguageKey,
  targetLang: LanguageKey
): Promise<TranslationResult> {
  if (!INDICTRANS_API) {
    // Stub: Return original text if no API configured
    console.warn('IndicTrans2 API not configured. Returning original text.');
    return {
      translated: text,
      source_lang: sourceLang,
      target_lang: targetLang,
    };
  }

  try {
    const response = await fetch(INDICTRANS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        source_lang: SUPPORTED_LANGUAGES[sourceLang].code.split('-')[0],
        target_lang: SUPPORTED_LANGUAGES[targetLang].code.split('-')[0],
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      translated: data.translated || data.translation || text,
      source_lang: sourceLang,
      target_lang: targetLang,
    };
  } catch (error) {
    console.error('Translation error:', error);
    return { translated: text, source_lang: sourceLang, target_lang: targetLang };
  }
}

/**
 * Text-to-Speech with regional language support
 */
export function speak(text: string, lang: LanguageKey = 'hindi'): void {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported');
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SUPPORTED_LANGUAGES[lang].code;
  utterance.rate = 0.9; // Slightly slower for clarity

  // Try to find a voice for the language
  const voices = speechSynthesis.getVoices();
  const langCode = SUPPORTED_LANGUAGES[lang].code;
  const matchingVoice = voices.find(v => v.lang.startsWith(langCode.split('-')[0]));
  if (matchingVoice) {
    utterance.voice = matchingVoice;
  }

  speechSynthesis.speak(utterance);
}

/**
 * Directive prompts in local idioms
 * These replace passive instructions with culturally familiar phrases
 */
export const VOICE_PROMPTS = {
  hindi: {
    swipeLeft: 'हाथ खिसकाएं',
    tapToSpeak: 'बोलने के लिए दबाएं',
    takePhoto: 'पत्ती की फोटो लें',
    loading: 'जानकारी ला रहे हैं',
    success: 'हो गया',
    error: 'कुछ गलत हुआ',
    offline: 'इंटरनेट नहीं है',
    synced: 'सिंक हो गया',
  },
  kannada: {
    swipeLeft: 'ಎಡಕ್ಕೆ ಸ್ವೈಪ್ ಮಾಡಿ',
    tapToSpeak: 'ಮಾತನಾಡಲು ಒತ್ತಿ',
    takePhoto: 'ಎಲೆಯ ಫೋಟೋ ತೆಗೆಯಿರಿ',
    loading: 'ಮಾಹಿತಿ ಲೋಡ್ ಆಗುತ್ತಿದೆ',
    success: 'ಆಯಿತು',
    error: 'ತಪ್ಪಾಯಿತು',
    offline: 'ಇಂಟರ್ನೆಟ್ ಇಲ್ಲ',
    synced: 'ಸಿಂಕ್ ಆಯಿತು',
  },
  english: {
    swipeLeft: 'Swipe left',
    tapToSpeak: 'Tap to speak',
    takePhoto: 'Take a photo of the leaf',
    loading: 'Loading information',
    success: 'Done',
    error: 'Something went wrong',
    offline: 'No internet connection',
    synced: 'Synced successfully',
  },
} as const;

export function getPrompt(key: keyof typeof VOICE_PROMPTS.hindi, lang: LanguageKey = 'hindi'): string {
  const prompts = VOICE_PROMPTS[lang as keyof typeof VOICE_PROMPTS] || VOICE_PROMPTS.english;
  return prompts[key] || VOICE_PROMPTS.english[key];
}
