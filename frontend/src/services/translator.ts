import { API_BASE_URL } from './api';

// In-memory cache for ultra-fast (0ms) response on repeated phrases
const translationCache = new Map<string, string>();

/**
 * Checks if text is already exclusively in English/Latin script.
 */
export function isPureEnglish(text: string): boolean {
  if (!text || !text.trim()) return true;
  // Match Latin characters, common punctuation, digits, spaces
  return /^[\u0000-\u007F\u0080-\u00FF\s.,!?'"()\-:;]+$/.test(text.trim());
}

/**
 * Checks if text contains Tamil script Unicode characters (\u0B80-\u0BFF).
 */
export function containsTamil(text: string): boolean {
  return /[\u0B80-\u0BFF]/.test(text);
}

/**
 * Normalizes language codes like 'en-IN', 'en-US' -> 'en', 'ta-IN' -> 'ta', etc.
 */
export function normalizeLanguageCode(code: string): string {
  if (!code) return 'en';
  if (code === 'multilingual') return 'en';
  return code.split('-')[0].toLowerCase();
}

/**
 * Translates a given text to the target language in real-time.
 * Uses direct Google Translate GTX engine with fallback to backend proxy and MyMemory.
 */
export async function translateLiveText(
  text: string,
  targetLangCode: string,
  sourceLangCode = 'auto'
): Promise<string> {
  const cleanText = text.trim();
  if (!cleanText) return '';

  const target = normalizeLanguageCode(targetLangCode);
  const source = sourceLangCode === 'auto' ? 'auto' : normalizeLanguageCode(sourceLangCode);

  // If target is English and text is already pure English, no translation needed
  if (target === 'en' && isPureEnglish(cleanText)) {
    return cleanText;
  }

  // If target is Tamil and text contains only Tamil characters without Latin alphabet
  if (target === 'ta' && containsTamil(cleanText) && !/[a-zA-Z]/.test(cleanText)) {
    return cleanText;
  }

  // Check cache
  const cacheKey = `${source}:${target}:${cleanText.toLowerCase()}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  // 1. Direct browser fetch to Google Translate GTX endpoint (CORS enabled)
  try {
    const encoded = encodeURIComponent(cleanText);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encoded}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2800);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0]
          .map((item: any) => (item && item[0] ? item[0] : ''))
          .join('')
          .trim();
        if (translated) {
          translationCache.set(cacheKey, translated);
          return translated;
        }
      }
    }
  } catch (err) {
    // Continue to backend fallback
  }

  // 2. Fallback to VoiceText backend proxy
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${API_BASE_URL}/api/transcriptions/translate/`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        text: cleanText,
        target_lang: target,
        source_lang: source,
      }),
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.translated_text) {
        const translated = data.translated_text.trim();
        translationCache.set(cacheKey, translated);
        return translated;
      }
    }
  } catch (err) {
    // Continue to MyMemory fallback
  }

  // 3. Fallback to MyMemory
  try {
    const langpair = source === 'auto' ? `ta|${target}` : `${source}|${target}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=${langpair}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      if (translated && !translated.startsWith('MYMEMORY WARNING')) {
        const cleaned = translated.trim();
        translationCache.set(cacheKey, cleaned);
        return cleaned;
      }
    }
  } catch (err) {
    // Return original text if all translation channels fail
  }

  return cleanText;
}
