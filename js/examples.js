// --- Example sentence generation (template fallback) ---
// Real AI generation would call an LLM API; for the prototype we use
// simple templates so the feature works fully offline.

const TEMPLATES = [
  { ua: (w) => `Я люблю ${w}.`, ja: (w) => `私は${w}が好きです。` },
  { ua: (w) => `Це ${w}.`, ja: (w) => `これは${w}です。` },
  { ua: (w) => `Де ${w}?`, ja: (w) => `${w}はどこですか？` },
  { ua: (w) => `Я бачу ${w}.`, ja: (w) => `私は${w}を見ます。` },
];

// Generate (or return cached) example sentences for a word.
export function generateExamples(item, count = 1) {
  const examples = [];
  for (let i = 0; i < count; i++) {
    const t = TEMPLATES[i % TEMPLATES.length];
    const ja = item.target || item.source;
    examples.push({ ua: t.ua(item.source), ja: t.ja(ja) });
  }
  return examples;
}
