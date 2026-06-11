// --- Translation: LibreTranslate first, with fallback endpoints ---

const ENDPOINTS = [
  'https://libretranslate.de/translate',
  'https://translate.terraprint.co/translate',
  'https://libretranslate.com/translate',
];

// Naive language detection: Cyrillic -> Ukrainian, otherwise Japanese.
export function detectLang(text) {
  return /[Ѐ-ӿ]/.test(text) ? 'uk' : 'ja';
}

async function tryEndpoint(url, text, source, target) {
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

// Returns translated text, or null if every endpoint failed.
export async function translateText(text, source, target) {
  if (!text.trim()) return '';
  for (const url of ENDPOINTS) {
    try {
      return await tryEndpoint(url, text, source, target);
    } catch (e) {
      // try next endpoint
    }
  }
  return null;
}

// Translate many short strings (words) sequentially with a small delay
// to be gentle on free public instances. Calls onProgress(i, total) as it goes.
export async function translateWords(wordList, source, target, onProgress) {
  const results = [];
  for (let i = 0; i < wordList.length; i++) {
    const t = await translateText(wordList[i], source, target);
    results.push(t === null ? '' : t);
    if (onProgress) onProgress(i + 1, wordList.length);
    await new Promise((r) => setTimeout(r, 120));
  }
  return results;
}
