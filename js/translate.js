// --- Translation: MyMemory (free, CORS-friendly, no key) as primary,
//     with LibreTranslate instances as fallback. ---

const LIBRE_ENDPOINTS = [
  'https://translate.terraprint.co/translate',
  'https://libretranslate.de/translate',
];

// Naive language detection: Cyrillic -> Ukrainian, otherwise Japanese.
export function detectLang(text) {
  return /[Ѐ-ӿ]/.test(text) ? 'uk' : 'ja';
}

async function tryMyMemory(text, source, target) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error('no translatedText');
  // MyMemory returns the original text (sometimes with a notice) on failure.
  if (/MYMEMORY WARNING|INVALID/i.test(translated)) throw new Error('mymemory warning');
  return translated;
}

async function tryLibre(url, text, source, target) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target, format: 'text' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.translatedText) throw new Error('no translatedText');
  return data.translatedText;
}

// Returns translated text, or null if every backend failed.
export async function translateText(text, source, target) {
  if (!text.trim()) return '';

  try {
    return await tryMyMemory(text, source, target);
  } catch (e) {
    // fall through to LibreTranslate fallbacks
  }

  for (const url of LIBRE_ENDPOINTS) {
    try {
      return await tryLibre(url, text, source, target);
    } catch (e) {
      // try next endpoint
    }
  }
  return null;
}

// Translate many short strings (words) sequentially with a small delay
// to be gentle on free public APIs. Calls onProgress(i, total) as it goes.
export async function translateWords(wordList, source, target, onProgress) {
  const results = [];
  for (let i = 0; i < wordList.length; i++) {
    const t = await translateText(wordList[i], source, target);
    results.push(t === null ? '' : t);
    if (onProgress) onProgress(i + 1, wordList.length);
    await new Promise((r) => setTimeout(r, 200));
  }
  return results;
}
